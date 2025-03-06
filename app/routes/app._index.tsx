import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  List,
  Link,
  InlineStack,
  Icon,
  Badge,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { SoundIcon, ExternalIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const color = ["Red", "Orange", "Yellow", "Green"][
    Math.floor(Math.random() * 4)
  ];
  const response = await admin.graphql(
    `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  barcode
                  createdAt
                }
              }
            }
          }
        }
      }`,
    {
      variables: {
        product: {
          title: `${color} Snowboard`,
        },
      },
    },
  );
  const responseJson = await response.json();

  const product = responseJson.data!.productCreate!.product!;
  const variantId = product.variants.edges[0]!.node!.id!;

  const variantResponse = await admin.graphql(
    `#graphql
    mutation shopifyRemixTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          barcode
          createdAt
        }
      }
    }`,
    {
      variables: {
        productId: product.id,
        variants: [{ id: variantId, price: "100.00" }],
      },
    },
  );

  const variantResponseJson = await variantResponse.json();

  return {
    product: responseJson!.data!.productCreate!.product,
    variant:
      variantResponseJson!.data!.productVariantsBulkUpdate!.productVariants,
  };
};

export default function Index() {
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();

  const shopify = useAppBridge();
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";
  const productId = fetcher.data?.product?.id.replace(
    "gid://shopify/Product/",
    "",
  );

  useEffect(() => {
    if (productId) {
      shopify.toast.show("Product created");
    }
  }, [productId, shopify]);
  
  const generateProduct = () => fetcher.submit({}, { method: "POST" });
  
  const handleConfigureClick = () => {
    navigate("/app/voice-assistant");
  };

  return (
    <Page>
      <TitleBar title="Voice AI Shopping Assistant">
        <button variant="primary" onClick={generateProduct}>
          Generate a product
        </button>
      </TitleBar>
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Welcome to Voice AI Shopping Assistant 🎉
                  </Text>
                  <Text variant="bodyMd" as="p">
                    Enhance your customers' shopping experience with a voice-powered AI assistant that helps them find products, answer questions, and make purchases using natural language.
                  </Text>
                </BlockStack>

                <BlockStack gap="200">
                  <InlineStack align="center" gap="200">
                    <Icon source={SoundIcon} color="success" />
                    <Text as="span" variant="headingSm">
                      Voice Assistant Status
                    </Text>
                    <Badge tone="success">Active</Badge>
                  </InlineStack>
                  <Text as="p" variant="bodyMd">
                    Your voice assistant is active and ready to help your customers. Visit the <Link url="/app/voice-assistant" removeUnderline>Voice Assistant</Link> page to customize its appearance and behavior.
                  </Text>
                </BlockStack>
                
                <Box paddingBlockEnd="200">
                  <Button primary onClick={handleConfigureClick}>
                    Configure Assistant
                  </Button>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Key Features
                  </Text>
                  <List>
                    <List.Item>
                      Voice-powered search for products and navigation
                    </List.Item>
                    <List.Item>
                      Natural language processing for customer intent
                    </List.Item>
                    <List.Item>
                      Seamless theme integration without custom coding
                    </List.Item>
                    <List.Item>
                      Customizable appearance to match your brand
                    </List.Item>
                  </List>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Next steps
                  </Text>
                  <List>
                    <List.Item>
                      <Link url="/app/voice-assistant" removeUnderline>
                        Customize your assistant's appearance
                      </Link>
                    </List.Item>
                    <List.Item>
                      <Link
                        url="https://shopify.dev/docs/themes/architecture/theme-app-extensions"
                        target="_blank"
                        removeUnderline
                      >
                        Learn about theme extensions{" "}
                        <Icon source={ExternalIcon} />
                      </Link>
                    </List.Item>
                    <List.Item>
                      Test your voice assistant on your storefront
                    </List.Item>
                  </List>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}