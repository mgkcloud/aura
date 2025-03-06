# Voice AI Shopping Assistant - Implementation Plan with Progress

## Overview

This guide provides a concrete, sequential implementation plan for building the Voice AI Shopping Assistant. Each step includes specific tasks, code snippets where appropriate, and validation criteria to ensure features work correctly before moving to the next step. ✓ marks completed tasks.

## Phase 1: Initial Setup (Days 1-2) ✓

### Step 1: Development Environment Setup ✓
1. ✓ Install or verify Node.js v18+
2. ✓ Create Shopify Partners account and development store
3. ✓ Install Shopify CLI: `npm install -g @shopify/cli @shopify/theme`
4. ✓ Create project folder and initialize Git repository

**Validation:** ✓
- ✓ Run `shopify version` to confirm CLI installation
- ✓ Successfully log in to Shopify Partners dashboard
- ✓ Verify Git repository is initialized with `.gitignore` for Node

### Step 2: Shopify App Scaffolding ✓
1. ✓ Create new app using Shopify CLI:
   ```bash
   shopify app create voice-ai-assistant --template node
   cd voice-ai-assistant
   ```
2. ✓ Install additional dependencies:
   ```bash
   npm install @shopify/polaris @shopify/app-bridge-react openai @prisma/client
   npm install --save-dev prisma
   ```
3. ✓ Initialize Prisma and set up database schema:
   ```bash
   npx prisma init
   ```

**Validation:** ✓
- ✓ App scaffolding completes without errors
- ✓ `npm run dev` starts development server successfully
- ✓ Directory structure matches Shopify app standards

## Phase 2: Database and Authentication (Days 3-4) - Partially Complete

### Step 3: Database Schema Implementation - In Progress
1. Edit `prisma/schema.prisma` to create the settings model:
   ```prisma
   model Shop {
     id          Int      @id @default(autoincrement())
     shopDomain  String   @unique
     settings    Settings?
   }

   model Settings {
     id              Int     @id @default(autoincrement())
     shop            Shop    @relation(fields: [shopId], references: [id])
     shopId          Int     @unique
     assistantName   String  @default("Shopping Assistant")
     welcomeMessage  String  @default("How can I help you shop today?")
     position        String  @default("bottom-right")
     colorHue        Int     @default(0)
     colorSaturation Int     @default(0)
     colorBrightness Int     @default(0)
     enabled         Boolean @default(true)
   }
   ```
   > **Note**: Currently only the Session model exists. The Shop and Settings models need to be added.
   
2. Generate Prisma client:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

**Validation:**
- Database tables created successfully
- Prisma client generated without errors
- Test database connection with a simple query

### Step 4: Authentication Implementation ✓
1. ✓ Configure Shopify OAuth in app configuration
2. ✓ Implement session storage using Prisma
3. ✓ Create middleware to protect admin routes

**Validation:** ✓
- ✓ Successfully authenticate the app with development store
- ✓ Session persists across page refreshes
- ✓ Unauthenticated requests are properly redirected

## Phase 3: Admin Interface (Days 5-7) - Mostly Complete

### Step 5: Admin Dashboard Structure ✓
1. ✓ Create layout with App Bridge integration
2. ✓ Implement navigation for the admin interface
3. ✓ Build dashboard home page that shows assistant status

**Validation:** ✓
- ✓ Admin interface loads within Shopify admin
- ✓ Navigation works between pages
- ✓ Layout is responsive and follows Polaris guidelines

### Step 6: Settings Page Implementation - In Progress
1. ✓ Create `app/routes/app.voice-assistant.tsx` with a form for settings
2. ✓ Implement the following settings:
   - ✓ Assistant name (text field)
   - ✓ Welcome message (text area)
   - ✓ Position dropdown (bottom-right, bottom-left, etc.)
   - ✓ Color picker for assistant theme
   - ✓ Enable/disable toggle
3. Create save functionality to update database
   > **Note**: The UI is working but currently just mocks saving data. Need to connect to real database.

**Validation:**
- ✓ Form renders with all settings fields
- Values are saved to database when form is submitted (pending)
- ✓ Success notification displays after saving
- ✓ Form validation prevents invalid inputs

## Phase 4: Theme Extension (Days 8-10) - Mostly Complete

### Step 7: Theme Extension Scaffolding ✓
1. ✓ Generate the extension:
   ```bash
   shopify app generate extension --type=theme-app-extension --name=voice-assistant
   ```
2. ✓ Configure `shopify.extension.toml` with required fields
3. ✓ Create basic directory structure for assets and snippets

**Validation:** ✓
- ✓ Extension generates successfully
- ✓ Can push extension to development store
- ✓ Extension appears in theme editor

### Step 8: Voice Assistant UI Components ✓
1. ✓ Create the assistant button in a liquid snippet
2. ✓ Design the voice assistant dialog UI
3. ✓ Implement basic CSS for styling both components
4. ✓ Add JavaScript for opening/closing the dialog

**Validation:** ✓
- ✓ Button renders on store frontend
- ✓ Dialog opens and closes correctly
- ✓ UI is responsive on mobile and desktop
- ✓ Styling is consistent with Shopify themes

### Step 9: Settings Integration - In Progress
1. ✓ Implement metafields to store assistant settings
2. Connect app settings with theme extension
   > **Note**: Basic data attribute integration exists, but real settings from database are not yet connected.

**Validation:**
- Changes to settings in admin reflect on frontend (pending)
- Assistant appears in correct position (partially complete)
- Colors and text match configured settings (partially complete)

## Phase 5: Voice Processing (Days 11-14) - Partially Complete

### Step 10: OpenAI Integration
1. Create OpenAI API account and get API key
2. Set up environment variables for API key
3. Create service for handling API requests:
   ```javascript
   import { Configuration, OpenAIApi } from 'openai';

   const configuration = new Configuration({
     apiKey: process.env.OPENAI_API_KEY,
   });

   const openai = new OpenAIApi(configuration);

   export async function processVoiceInput(text) {
     try {
       const response = await openai.createCompletion({
         model: "gpt-3.5-turbo-instruct",
         prompt: `You are a helpful shopping assistant. Respond to: ${text}`,
         max_tokens: 150,
       });
       
       return response.data.choices[0].text.trim();
     } catch (error) {
       console.error('OpenAI Error:', error);
       return "I'm sorry, I couldn't process that request.";
     }
   }
   ```

**Validation:**
- OpenAI API connection works
- Responses are relevant to input
- Error handling works correctly

### Step 11: Voice Recognition Implementation ✓
1. ✓ Implement Web Speech API in assistant JavaScript:
   ```javascript
   const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
   recognition.lang = 'en-US';
   recognition.interimResults = false;

   document.querySelector('#voice-button').addEventListener('click', () => {
     recognition.start();
     showListeningState();
   });

   recognition.onresult = (event) => {
     const transcript = event.results[0][0].transcript;
     processVoiceInput(transcript);
   };
   ```
2. ✓ Add visual feedback for listening state
3. ✓ Implement error handling for unsupported browsers

**Validation:** ✓
- ✓ Voice recognition activates on button click
- ✓ Visual feedback shows listening state
- ✓ Transcript is captured accurately
- ✓ Fallback for unsupported browsers works

### Step 12: Voice-to-API Pipeline - In Progress
1. Create API endpoint for processing voice input
2. ✓ Connect frontend voice recognition to backend API (mock implementation)
3. ✓ Implement response handling and display
   > **Note**: Current implementation has mock responses. Need to connect to real OpenAI API.

**Validation:**
- Voice input successfully reaches backend (mock only)
- API processes input and returns response (mock only)
- ✓ Response displays correctly in assistant UI
- End-to-end flow works without errors (partial implementation)

## Phase 6: Product Search (Days 15-18) - Not Started

### Step 13: Shopify Product API Integration
1. Set up Storefront API access
2. Create GraphQL queries for product search:
   ```javascript
   const PRODUCT_SEARCH_QUERY = `
     query searchProducts($query: String!, $first: Int!) {
       products(query: $query, first: $first) {
         edges {
           node {
             id
             title
             description
             priceRange {
               minVariantPrice {
                 amount
                 currencyCode
               }
             }
             featuredImage {
               url
               altText
             }
             handle
           }
         }
       }
     }
   `;

   async function searchProducts(query, first = 5) {
     // Implementation of Storefront API call
   }
   ```
3. Implement function to extract search terms from voice input

**Validation:**
- Products can be searched via API
- Search returns relevant results
- API calls are optimized for performance

### Step 14: Search Results Presentation
1. Design and implement search results UI in the assistant
2. Create product card component for displaying results
3. Add "View Product" and "Add to Cart" functionality

**Validation:**
- Search results display properly
- Product information is complete and accurate
- Links to products work correctly
- Add to cart functionality works

## Phase 7: Refinement & Testing (Days 19-21) - Not Started

### Step 15: Error Handling Implementation
1. Add comprehensive error handling for:
   - Voice recognition failures
   - API request failures
   - Empty search results
   - Browser compatibility issues
2. Create user-friendly error messages
3. Implement fallback to text input when voice fails

**Validation:**
- App handles all error states gracefully
- User receives helpful feedback on errors
- Fallback methods work correctly

### Step 16: Performance Optimization
1. Optimize JavaScript bundle size
2. Implement lazy loading for non-critical components
3. Add caching for API responses
4. Test and optimize load times

**Validation:**
- JavaScript bundle under 100KB
- Initial load time under 1 second
- Voice processing latency under 500ms

### Step 17: Cross-Browser Testing
1. Test on Chrome, Firefox, Safari, and Edge
2. Test on iOS and Android devices
3. Fix any browser-specific issues

**Validation:**
- Functions correctly on all major browsers
- Mobile experience works properly
- No critical browser-specific bugs

## Phase 8: Launch Preparation (Days 22-24) - Not Started

### Step 18: Analytics Implementation
1. Add basic analytics tracking for:
   - Assistant activation
   - Voice queries
   - Search result clicks
   - Add to cart events
2. Create simple dashboard for merchants

**Validation:**
- Analytics events are tracked correctly
- Dashboard displays useful information
- No performance impact from tracking

### Step 19: Documentation & App Store Listing
1. Create merchant documentation
2. Prepare screenshots and video demo
3. Write app listing description and highlights
4. Submit for app store review

**Validation:**
- Documentation clearly explains all features
- App store listing is compelling and accurate
- App passes Shopify review requirements

## Testing Process

For each feature, follow this testing process:
1. **Unit Testing**: Test individual functions
2. **Integration Testing**: Test feature working with other components
3. **User Flow Testing**: Test complete user journeys
4. **Edge Case Testing**: Test with unexpected inputs/conditions

Document any issues found and fix before moving to the next step.

## Deployment Process

1. **Development Store**: Initial testing environment
2. **Beta Testing**: Limited release to friendly merchants
3. **Public Release**: Full App Store launch

## Post-Launch Tasks

1. Monitor analytics for usage patterns
2. Collect and analyze merchant feedback
3. Implement high-priority improvements
4. Plan next feature iteration

## Next Steps Priority

Based on current progress, the recommended next steps are:

1. Complete the database schema by adding Shop and Settings models
2. Connect the settings form to the database for real data persistence
3. Set up OpenAI integration for voice processing
4. Create API endpoints for voice processing
5. Integrate Storefront API for product search

---

This implementation plan will be updated as progress continues to reflect completed tasks and changing priorities. 