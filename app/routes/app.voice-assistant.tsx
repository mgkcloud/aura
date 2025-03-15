import { useEffect, useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Banner,
  Button,
  Form,
  FormLayout,
  TextField,
  Select,
  PageActions,
  ColorPicker,
  hsbToRgb,
  rgbToHsb,
  rgbString,
  ContextualSaveBar,
  Spinner,
  Box,
} from "@shopify/polaris";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { getShopifyCartData } from "../livekit-proxy.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  // Fetch cart data to provide context to the voice assistant
  const cartData = await getShopifyCartData(request);
  
  // Set up the metafield with the config URL
  const appHost = process.env.SHOPIFY_APP_URL || 'http://localhost:3000';
  const configUrl = `${appHost}/api/voice-assistant/config`;
  
  try {
    // Set a metafield that the theme extension can access
    await admin.graphql(`
      mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        metafields: [
          {
            ownerId: `gid://shopify/App/${process.env.SHOPIFY_VOICE_ASSISTANT_ID}`,
            namespace: "voice_assistant",
            key: "config_url",
            value: configUrl,
            type: "single_line_text_field"
          }
        ]
      }
    });
  } catch (error) {
    console.error("Error setting metafield:", error);
  }
  
  return json({
    shop: session.shop,
    liveKitUrl: process.env.LIVEKIT_URL || "ws://localhost:7880",
    liveKitKey: process.env.LIVEKIT_KEY || "",
    cartData,
    configUrl
  });
};

export default function VoiceAssistantSettings() {
  const { shop, liveKitUrl, liveKitKey, cartData, configUrl } = useLoaderData<typeof loader>();
  
  const [settings, setSettings] = useState({
    assistantName: "Shopping Assistant",
    welcomeMessage: "How can I help you shop today?",
    position: "bottom-right",
    color: {
      hue: 0,
      brightness: 0,
      saturation: 0,
    },
    hasChanges: false,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [audioStreamActive, setAudioStreamActive] = useState(false);
  const [testingMode, setTestingMode] = useState(false);
  const [responseMessage, setResponseMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

  // Mock loading of settings
  useEffect(() => {
    // In a real implementation, you would load these settings from your API
    setTimeout(() => {
      setSettings({
        assistantName: "Voice Shopping Assistant",
        welcomeMessage: "How can I help you shop today?",
        position: "bottom-right",
        color: rgbToHsb({
          red: 0,
          green: 0,
          blue: 0,
        }),
        hasChanges: false,
      });
    }, 500);
  }, []);
  
  // Initialize WebSocket connection
  useEffect(() => {
    if (!testingMode) return;
    
    try {
      const ws = new WebSocket(liveKitUrl);
      
      ws.onopen = () => {
        console.log('WebSocket connection established');
        // Initialize session
        ws.send(JSON.stringify({
          type: 'init',
          participantId: `admin-${Date.now()}`,
          shopId: shop
        }));
        
        // Send cart data if available
        if (cartData && cartData.items.length > 0) {
          ws.send(JSON.stringify({
            type: 'cart',
            shopId: shop,
            items: cartData.items
          }));
        }
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message received:', data);
          
          if (data.type === 'init_ack') {
            console.log('Connection initialized with ID:', data.participantId);
          } else if (data.type === 'result') {
            setResponseMessage(data.result.message);
            setIsProcessing(false);
          } else if (data.type === 'error') {
            console.error('Error from server:', data.error);
            setResponseMessage(`Error: ${data.error}`);
            setIsProcessing(false);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setResponseMessage('Error connecting to server');
      };
      
      ws.onclose = () => {
        console.log('WebSocket connection closed');
        setAudioStreamActive(false);
      };
      
      setWsConnection(ws);
      
      return () => {
        ws.close();
      };
    } catch (error) {
      console.error('Error setting up WebSocket:', error);
    }
  }, [testingMode, shop, liveKitUrl]);

  // Initialize audio context and stream when testing mode is enabled
  const startAudioStream = useCallback(async () => {
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
      setResponseMessage('WebSocket not connected');
      return;
    }
    
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      // Create audio context
      const context = new AudioContext();
      
      // Choose appropriate mime type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
        ? 'audio/webm' 
        : 'audio/mp4';
      
      // Create media recorder
      const recorder = new MediaRecorder(stream, { mimeType });
      
      // Handle data available events
      recorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && wsConnection && wsConnection.readyState === WebSocket.OPEN) {
          // Convert blob to base64
          const reader = new FileReader();
          reader.readAsDataURL(event.data);
          reader.onloadend = () => {
            const base64data = reader.result?.toString().split(',')[1];
            if (base64data) {
              wsConnection.send(JSON.stringify({
                type: 'audio',
                data: base64data,
                requestId: Date.now().toString()
              }));
            }
          };
        }
      };
      
      // Start recording
      recorder.start(1000); // Send audio chunks every second
      
      setAudioContext(context);
      setMediaRecorder(recorder);
      setAudioStream(stream);
      setAudioStreamActive(true);
      setIsProcessing(true);
      setResponseMessage('Listening...');
      
    } catch (error) {
      console.error('Error starting audio stream:', error);
      setResponseMessage('Error accessing microphone');
    }
  }, [wsConnection]);
  
  // Stop audio stream
  const stopAudioStream = useCallback(() => {
    if (mediaRecorder) {
      mediaRecorder.stop();
    }
    
    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
    }
    
    if (audioContext) {
      audioContext.close();
    }
    
    setAudioStreamActive(false);
    setAudioContext(null);
    setMediaRecorder(null);
    setAudioStream(null);
  }, [mediaRecorder, audioStream, audioContext]);

  const handleChange = (field) => (value) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
      hasChanges: true,
    }));
  };

  const handleColorChange = (color) => {
    setSettings((prev) => ({
      ...prev,
      color,
      hasChanges: true,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      // In a real implementation, you would save these settings to your API
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      setSettings((prev) => ({
        ...prev,
        hasChanges: false,
      }));
      
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (error) {
      console.error("Error saving settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    // Reset to the last saved state
    // In a real implementation, you would reload from your API
    setSettings((prev) => ({
      ...prev,
      hasChanges: false,
    }));
  };

  const positionOptions = [
    { label: "Bottom Right", value: "bottom-right" },
    { label: "Bottom Left", value: "bottom-left" },
  ];

  const colorString = rgbString(hsbToRgb(settings.color));

  return (
    <Page
      title="Voice Assistant Settings"
      subtitle="Configure how the voice assistant appears and functions on your storefront"
    >
      {settings.hasChanges && (
        <ContextualSaveBar
          message="Unsaved changes"
          saveAction={{
            onAction: handleSave,
            loading: isSaving,
            disabled: isSaving,
          }}
          discardAction={{
            onAction: handleDiscardChanges,
          }}
        />
      )}

      {savedSuccess && (
        <Banner
          title="Settings saved"
          status="success"
          onDismiss={() => setSavedSuccess(false)}
        />
      )}

      <Layout>
        <Layout.Section>
          <Card>
            <Card.Section>
              <Form onSubmit={handleSave}>
                <FormLayout>
                  <TextField
                    label="Assistant Name"
                    value={settings.assistantName}
                    onChange={handleChange("assistantName")}
                    autoComplete="off"
                  />
                  
                  <TextField
                    label="Welcome Message"
                    value={settings.welcomeMessage}
                    onChange={handleChange("welcomeMessage")}
                    autoComplete="off"
                    multiline={3}
                  />
                  
                  <Select
                    label="Position"
                    options={positionOptions}
                    value={settings.position}
                    onChange={handleChange("position")}
                  />
                  
                  <BlockStack gap="400">
                    <Text variant="bodyMd" as="p">
                      Assistant Color
                    </Text>
                    <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                      <ColorPicker onChange={handleColorChange} color={settings.color} />
                      <div
                        style={{
                          width: "40px",
                          height: "40px",
                          borderRadius: "4px",
                          backgroundColor: colorString,
                          boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.1)",
                        }}
                      />
                    </div>
                  </BlockStack>
                </FormLayout>
              </Form>
            </Card.Section>
          </Card>
          
          <div style={{ marginTop: "20px" }}></div>
          
          <Card>
            <Card.Section>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Test Live Voice Assistant
                </Text>
                <Text variant="bodyMd" as="p">
                  Test the voice assistant with real-time audio streaming. This will use the Ultravox model via Replicate to process your voice commands.
                </Text>
                
                <BlockStack gap="400">
                  <Button 
                    onClick={() => setTestingMode(!testingMode)}
                    primary={!testingMode}
                    disabled={testingMode && audioStreamActive}
                  >
                    {testingMode ? "Exit Testing Mode" : "Enter Testing Mode"}
                  </Button>
                  
                  {testingMode && (
                    <div style={{ marginTop: '16px' }}>
                      <BlockStack gap="400">
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <Button 
                            onClick={audioStreamActive ? stopAudioStream : startAudioStream}
                            primary={!audioStreamActive}
                            disabled={!testingMode || (audioStreamActive && isProcessing)}
                          >
                            {audioStreamActive ? "Stop Listening" : "Start Listening"}
                          </Button>
                          
                          {isProcessing && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Spinner size="small" />
                              <Text>Processing...</Text>
                            </div>
                          )}
                        </div>
                        
                        <div style={{ 
                          padding: '16px', 
                          border: '1px solid #ddd', 
                          borderRadius: '8px',
                          backgroundColor: '#f9f9f9',
                          minHeight: '80px'
                        }}>
                          <Text variant="headingMd" as="h3">Response:</Text>
                          <Text>{responseMessage || 'No response yet'}</Text>
                        </div>
                        
                        <div>
                          <Text variant="bodyMd" as="p">Cart Items: {cartData.items.length}</Text>
                          <Text variant="bodyMd" as="p">Shop: {shop}</Text>
                          <Text variant="bodyMd" as="p">WebSocket: {wsConnection && wsConnection.readyState === WebSocket.OPEN ? 'Connected' : 'Disconnected'}</Text>
                        </div>
                      </BlockStack>
                    </div>
                  )}
                </BlockStack>
              </BlockStack>
            </Card.Section>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Card.Section>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Preview
                </Text>
                <div
                  style={{
                    position: "relative",
                    height: "300px",
                    border: "1px solid #e1e3e5",
                    borderRadius: "4px",
                    overflow: "hidden",
                    backgroundColor: "#f6f6f7",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      bottom: "20px",
                      ...(settings.position === "bottom-right"
                        ? { right: "20px" }
                        : { left: "20px" }),
                    }}
                  >
                    <div
                      style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: "50%",
                        backgroundColor: colorString,
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2)",
                        cursor: "pointer",
                      }}
                    >
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M12 15C13.66 15 15 13.66 15 12V6C15 4.34 13.66 3 12 3C10.34 3 9 4.34 9 6V12C9 13.66 10.34 15 12 15Z"
                          fill="currentColor"
                        />
                        <path
                          d="M17 12C17 14.76 14.76 17 12 17C9.24 17 7 14.76 7 12H5C5 15.53 7.61 18.43 11 18.93V21H13V18.93C16.39 18.43 19 15.53 19 12H17Z"
                          fill="currentColor"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </BlockStack>
            </Card.Section>
          </Card>
        </Layout.Section>
      </Layout>

      <PageActions
        primaryAction={{
          content: "Save",
          onAction: handleSave,
          loading: isSaving,
          disabled: !settings.hasChanges || isSaving,
        }}
        secondaryActions={[
          {
            content: "Discard changes",
            onAction: handleDiscardChanges,
            disabled: !settings.hasChanges || isSaving,
          },
        ]}
      />
    </Page>
  );
}