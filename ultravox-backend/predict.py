import json
import transformers
import torch
import librosa
import io
import base64
from cog import BasePredictor, Input

MODEL = "fixie-ai/ultravox-v0_5-llama-3_1-8b"

class Predictor(BasePredictor):
    def setup(self):
        bnb_config = transformers.BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_use_double_quant=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.bfloat16
        )
        
        self.tokenizer = transformers.AutoTokenizer.from_pretrained(
            MODEL,
            trust_remote_code=True
        )
        
        self.pipeline = transformers.pipeline(
            model=MODEL,
            tokenizer=self.tokenizer,
            torch_dtype=torch.bfloat16,
            trust_remote_code=True,
            device_map="auto",
            quantization_config=bnb_config
        )
    
    def predict(
        self,
        command: str = Input(description="User command (text)"),
        audio: str = Input(description="Base64 audio"),
        shop_domain: str = Input(description="Shop domain (optional)", default="")
    ) -> str:
        try:
            # Decode the base64 audio
            audio_data = base64.b64decode(audio)
            audio_tensor, sr = librosa.load(io.BytesIO(audio_data), sr=16000)
            
            # Prepare the conversation
            turns = [
                {
                    "role": "system",
                    "content": "You are a helpful shopping assistant. Output JSON: {'message': '...', 'action': 'search'|'collection'|'none', 'query'?..., 'handle'?...}"
                },
                {
                    "role": "user",
                    "content": command
                }
            ]
            
            # Run the model
            response = self.pipeline(
                {
                    'audio': audio_tensor,
                    'turns': turns,
                    'sampling_rate': sr
                },
                max_new_tokens=100,
                do_sample=True,
                top_k=50,
                top_p=0.95,
                num_return_sequences=1,
                batch_size=1
            )[0]['generated_text']
            
            # Extract the assistant's response
            assistant_response = response.split("<|assistant|>")[-1].strip()
            
            # Try to parse the JSON response
            try:
                response_data = json.loads(assistant_response)
                message = response_data.get('message', assistant_response)
                action = response_data.get('action', 'none')
                query = response_data.get('query')
                handle = response_data.get('handle')
            except json.JSONDecodeError:
                message = assistant_response
                action = 'none'
                query = None
                handle = None
            
            return json.dumps({
                'message': message,
                'action': action,
                'query': query,
                'handle': handle
            })
            
        except Exception as e:
            return json.dumps({'message': f'Error: {e}'})