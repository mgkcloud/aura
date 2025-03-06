import { useEffect, useState } from "react";
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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function VoiceAssistantSettings() {
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