import { json, LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.checkSessionCookie(request);
  
  const url = new URL(request.url);
  const predictionId = url.searchParams.get('id');

  if (!predictionId) {
    return json({ error: "Missing prediction ID" }, { status: 400 });
  }

  try {
    const response = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: {
        Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Replicate API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const prediction = await response.json();

    if (prediction.status === "succeeded") {
      return json({ status: "succeeded", output: prediction.output });
    } else if (prediction.status === "failed") {
      return json({ status: "failed", error: prediction.error });
    } else {
      return json({ status: prediction.status });
    }
  } catch (error) {
    console.error('Error polling Replicate:', error);
    return json({ error: 'Error polling prediction status' }, { status: 500 });
  }
};