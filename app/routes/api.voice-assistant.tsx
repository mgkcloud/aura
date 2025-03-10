import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.public.checkSessionCookie(request);
  const { command, shopDomain, audio } = await request.json();

  try {
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        version: process.env.ULTRAVOX_MODEL_VERSION,
        input: {
          command,
          audio,
          shop_domain: shopDomain
        }
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Replicate API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const prediction = await response.json();

    if (prediction.status === "succeeded") {
      return json(JSON.parse(prediction.output));
    } else if (prediction.status === "failed") {
      throw new Error(`Replicate prediction failed: ${prediction.error}`);
    } else {
      return json({ status: "pending", id: prediction.id }, { status: 202 });
    }
  } catch (error) {
    console.error('Error calling Replicate:', error);
    return json({ message: 'Error processing voice command' }, { status: 500 });
  }
};