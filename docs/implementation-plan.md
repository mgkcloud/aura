

The Voice AI Shopping Assistant is a Shopify app that enables voice-based navigation and assistance for online shoppers. It consists of a frontend theme extension providing a floating voice assistant button and an expandable information window, with backend processing powered by the Ultravox AI model through Replicate.

### Core Components:
- Shopify App (Remix framework)
- Theme Extension (voice assistant interface)
- LiveKit WebSocket server (audio streaming)
- Ultravox AI model (deployed on Replicate)
- Admin configuration interface

## 2. Technical Architecture

### 2.1 Data Flow
1. User activates the voice assistant button on the Shopify storefront
2. Audio is captured in the browser and streamed via WebSockets to the LiveKit proxy
3. LiveKit proxy buffers audio chunks and sends them to the Ultravox model on Replicate
4. Ultravox processes the audio and determines user intent
5. Backend prepares response data and navigation instructions
6. Frontend displays information in the floating window and/or navigates to the appropriate page

### 2.2 Technology Stack
- **Frontend**: React, Shopify Polaris, WebSocket client
- **Backend**: Node.js, Remix, WebSocket server (LiveKit)
- **Database**: Prisma ORM with SQLite (dev) / PostgreSQL (prod)
- **AI Processing**: Ultravox model via Replicate API
- **APIs**: Shopify Admin API, Shopify Storefront API
- **Infrastructure**: Docker for local development

## 3. Implementation Plan

### 3.1 Development Environment Setup

#### 3.1.1 Initial Project Configuration
- [x] Initialize Shopify app with Remix framework
- [x] Set up local development environment
- [x] Install necessary dependencies
- [x] Configure basic directory structure
- [ ] Create comprehensive .env.example file with all required variables
- [ ] Complete .env file with development credentials
  - [ ] Add Shopify API key and secret
  - [ ] Configure Replicate API token
  - [ ] Set LiveKit credentials
  - [ ] Set database URL
- [ ] Initialize Git repository with proper .gitignore
- [ ] Configure TypeScript settings for the project
- [ ] Set up ESLint and Prettier for code formatting
- [ ] Document local setup process in README.md

#### 3.1.2 Docker Configuration
- [x] Create Dockerfile for LiveKit proxy
- [x] Set up docker-compose.yml file
- [ ] Configure Docker volumes for persistent data
- [ ] Create Docker network configuration
- [ ] Set up environment variable passing to containers
- [ ] Document Docker container startup process
- [ ] Create container health checks
- [ ] Implement container logging configuration

#### 3.1.3 LiveKit Server Setup
- [ ] Pull LiveKit server Docker image
- [ ] Configure LiveKit server environment variables
- [ ] Set up LiveKit authentication
- [ ] Create startup script for LiveKit server
- [ ] Configure LiveKit room management
- [ ] Set up LiveKit monitoring
- [ ] Test LiveKit server connection
- [ ] Document LiveKit server configuration

#### 3.1.4 Local Development Workflow
- [ ] Create npm scripts for common development tasks
- [ ] Set up concurrent running of Shopify CLI and LiveKit
- [ ] Configure hot-reloading for development
- [ ] Create debugging configuration
- [ ] Document local development workflow
- [ ] Set up VS Code configurations (optional)
- [ ] Create troubleshooting guide for common setup issues

### 3.2 Database Setup and Configuration

#### 3.2.1 Prisma Configuration
- [x] Initialize Prisma ORM
- [x] Create initial database schema
- [ ] Define session storage models
- [ ] Create assistant configuration models
- [ ] Set up usage analytics models
- [ ] Configure Prisma client generation
- [ ] Document database schema design

#### 3.2.2 Database Migration Management
- [ ] Create initial migration scripts
- [ ] Set up migration process for development
- [ ] Configure migration process for production
- [ ] Create database seeding scripts (if needed)
- [ ] Document migration procedures
- [ ] Implement database backup strategy
- [ ] Test migration rollback procedures

#### 3.2.3 Data Access Layer
- [ ] Create database access utilities
- [ ] Implement CRUD operations for configuration data
- [ ] Set up session storage functionality
- [ ] Create analytics data capture methods
- [ ] Implement error handling for database operations
- [ ] Add logging for database queries
- [ ] Create database connection pooling configuration

### 3.3 Shopify App Backend Implementation

#### 3.3.1 Authentication & Authorization
- [x] Implement Shopify OAuth flow
- [x] Set up session management
- [ ] Configure required app scopes
- [ ] Implement session validation middleware
- [ ] Create authenticated route protection
- [ ] Handle session expiration and renewal
- [ ] Implement webhook verification
- [ ] Test authentication flow end-to-end

#### 3.3.2 Admin API Integration
- [x] Set up GraphQL client for Admin API
- [ ] Create product fetching utilities
- [ ] Implement collection data retrieval
- [ ] Set up store information queries
- [ ] Create theme detection functionality
- [ ] Implement API error handling
- [ ] Add rate limiting compliance
- [ ] Set up request caching for performance

#### 3.3.3 App Routes Configuration
- [x] Set up core app routes
- [ ] Implement admin dashboard route
- [ ] Create configuration page routes
- [ ] Set up analytics viewing routes
- [ ] Implement WebSocket endpoints
- [ ] Create API endpoints for frontend
- [ ] Add health check endpoints
- [ ] Configure 404 and error handling routes

#### 3.3.4 Admin Interface
- [x] Create basic settings interface
- [ ] Implement settings persistence
- [ ] Create color picker component
- [ ] Implement position selector
- [ ] Add form validation
- [ ] Create settings preview functionality
- [ ] Implement settings retrieval on load
- [ ] Add save confirmation and error handling

### 3.4 Audio Processing Infrastructure

#### 3.4.1 WebSocket Server Implementation
- [x] Create WebSocket server setup
- [x] Implement connection handling
- [x] Set up message types and protocols
- [ ] Create participant identification system
- [ ] Implement room management
- [ ] Add error handling and recovery
- [ ] Implement ping/pong for connection health
- [ ] Set up connection state tracking
- [ ] Add logging and monitoring
- [ ] Implement security measures (rate limiting, etc.)
- [ ] Create reconnection logic
- [ ] Test with multiple concurrent connections

#### 3.4.2 Audio Streaming Configuration
- [x] Implement audio buffer management
- [x] Set up audio chunking and transmission
- [ ] Configure audio quality parameters
- [ ] Implement adaptable buffer sizes
- [ ] Create audio format conversion if needed
- [ ] Add handling for different sample rates
- [ ] Optimize for various network conditions
- [ ] Implement audio pipeline monitoring
- [ ] Test with various audio inputs and conditions

#### 3.4.3 LiveKit Proxy Implementation
- [x] Create LiveKit proxy server
- [ ] Implement WebSocket to LiveKit bridging
- [ ] Set up LiveKit room creation and management
- [ ] Configure participant tracking
- [ ] Implement authentication token generation
- [ ] Create session context maintenance
- [ ] Add error handling and logging
- [ ] Implement resource cleanup procedures
- [ ] Test proxy with various client scenarios

#### 3.4.4 Error Handling and Recovery
- [ ] Implement connection error detection
- [ ] Create fallback mechanisms for failed connections
- [ ] Add automatic reconnection logic
- [ ] Implement graceful degradation options
- [ ] Create user-friendly error messages
- [ ] Add logging for error diagnostic purposes
- [ ] Set up alerting for critical failures
- [ ] Test recovery from various failure scenarios

### 3.5 Replicate AI Model Integration

#### 3.5.1 Development Environment Setup
- [x] Configure Replicate API access
- [x] Implement basic API client
- [ ] Set up development model endpoint
- [ ] Create test suite for model responses
- [ ] Implement request/response logging
- [ ] Add error handling for API failures
- [ ] Create response mocking for development
- [ ] Document model interaction patterns

#### 3.5.2 Ultravox Model Deployment (Replicate)
- [x] Set up Replicate account and API access
- [ ] Install Cog CLI tools (`pip install cog`)
- [ ] Configure cog.yaml for Ultravox model
- [ ] Prepare model dependencies
- [ ] Set up model weights and configuration
- [ ] Test model locally with Cog
- [ ] Package model for Replicate deployment
- [ ] Push model to Replicate (`cog push r8.im/username/ultravox-model`)
- [ ] Test deployed model with sample inputs
- [ ] Configure model version in environment variables
- [ ] Set up monitoring for model API health
- [ ] Document model deployment process

#### 3.5.3 Request Processing
- [x] Implement audio data preparation for model
- [ ] Create user intent extraction logic
- [ ] Set up context management for conversations
- [ ] Implement prompt engineering for optimal results
- [ ] Add response parsing and normalization
- [ ] Create fallback handling for ambiguous requests
- [ ] Implement retry logic for failed requests
- [ ] Add response caching for common queries
- [ ] Set up request batching if applicable
- [ ] Create detailed logging for request diagnostics
- [ ] Implement request timeout handling

#### 3.5.4 Response Handling and Action Determination
- [x] Create response parsing functionality
- [ ] Implement action determination logic
- [ ] Set up navigation intent processing
- [ ] Create product search intent handling
- [ ] Implement information request processing
- [ ] Add response formatting for display
- [ ] Create error handling for malformed responses
- [ ] Implement confidence scoring for responses
- [ ] Add fallback responses for low confidence
- [ ] Create response transformation for frontend display
- [ ] Test with various model response scenarios

### 3.6 Shopify Theme Extension Development

#### 3.6.1 Extension Configuration
- [x] Initialize theme extension structure
- [x] Configure extension settings in TOML file
- [ ] Set up asset management for extension
- [ ] Create extension localization
- [ ] Configure extension metadata
- [ ] Implement extension versioning
- [ ] Add conditional loading mechanisms
- [ ] Document extension configuration options

#### 3.6.2 Voice Assistant Button Component
- [x] Create floating button component
- [ ] Implement position customization (bottom-right, bottom-left)
- [ ] Add color customization from settings
- [ ] Create animation states (idle, listening, processing)
- [ ] Implement accessibility attributes (ARIA)
- [ ] Add keyboard navigation support
- [ ] Create mobile-specific adaptations
- [ ] Implement touch interaction handling
- [ ] Add tooltip/introduction for first-time users
- [ ] Create visual indicators for connection state
- [ ] Test on various devices and screen sizes

#### 3.6.3 Audio Capture Implementation
- [x] Implement microphone access request
- [x] Create audio recording functionality
- [ ] Add visual feedback during recording
- [ ] Implement volume level visualization
- [ ] Create permission handling and error states
- [ ] Add noise detection and notification
- [ ] Implement recording timeout handling
- [ ] Create fallback text input option
- [ ] Add audio quality monitoring
- [ ] Implement adaptable recording parameters
- [ ] Test on various browsers and devices

#### 3.6.4 Information Window Component
- [ ] Design expandable information window
- [ ] Implement window positioning logic relative to button
- [ ] Create content rendering components
- [ ] Add support for text, images, and product displays
- [ ] Implement scrolling for overflow content
- [ ] Create animation states (appear, update, dismiss)
- [ ] Add interaction handlers (links, buttons)
- [ ] Implement dismissal logic
- [ ] Create responsive design adaptations
- [ ] Add keyboard navigation within the window
- [ ] Implement screen reader compatibility
- [ ] Test with various content types and lengths

#### 3.6.5 Store Navigation Integration
- [ ] Implement page navigation functionality
- [ ] Create smooth transition effects
- [ ] Add history state management
- [ ] Implement navigation confirmation when needed
- [ ] Create deep linking capabilities
- [ ] Add parameter passing to destination pages
- [ ] Implement scroll position management
- [ ] Create fallbacks for failed navigation
- [ ] Add analytics tracking for navigation events
- [ ] Test on various page types and structures

### 3.7 Testing and Quality Assurance

#### 3.7.1 Unit Testing
- [ ] Set up testing framework (Jest or equivalent)
- [ ] Create test utilities and helpers
- [ ] Implement tests for core utility functions
- [ ] Add tests for API client functionality
- [ ] Create component rendering tests
- [ ] Implement state management tests
- [ ] Add model response parsing tests
- [ ] Create database operation tests
- [ ] Implement WebSocket functionality tests
- [ ] Set up continuous integration for tests
- [ ] Generate test coverage reports
- [ ] Document testing procedures

#### 3.7.2 Integration Testing
- [ ] Create end-to-end test scenarios
- [ ] Implement tests for authentication flow
- [ ] Add tests for voice processing pipeline
- [ ] Create tests for Shopify API integrations
- [ ] Implement WebSocket communication tests
- [ ] Add database operation sequence tests
- [ ] Create user flow integration tests
- [ ] Implement cross-browser testing
- [ ] Add mobile device testing
- [ ] Document integration test procedures
- [ ] Create test environment setup guide

#### 3.7.3 Performance Testing
- [ ] Set up performance measurement tools
- [ ] Create baseline performance metrics
- [ ] Implement load testing for WebSocket server
- [ ] Add response time measurement
- [ ] Create memory usage monitoring
- [ ] Implement CPU utilization tracking
- [ ] Add network performance testing
- [ ] Create concurrent user simulation
- [ ] Implement threshold alerts for performance
- [ ] Document performance testing results
- [ ] Create performance optimization recommendations

#### 3.7.4 User Acceptance Testing
- [ ] Create test scenarios for merchants
- [ ] Develop test cases for shoppers
- [ ] Implement feedback collection mechanisms
- [ ] Set up UAT environment
- [ ] Create UAT documentation and guides
- [ ] Conduct testing sessions
- [ ] Collect and analyze feedback
- [ ] Prioritize issues and enhancement requests
- [ ] Implement critical fixes
- [ ] Document UAT results and recommendations

### 3.8 Deployment Preparation

#### 3.8.1 Production Environment Configuration
- [ ] Select hosting provider for app
- [ ] Configure production database
- [ ] Set up production WebSocket server
- [ ] Create production environment variables
- [ ] Implement SSL/TLS configuration
- [ ] Set up domain and DNS settings
- [ ] Configure firewall and security settings
- [ ] Implement backup procedures
- [ ] Create disaster recovery plan
- [ ] Set up monitoring and alerting
- [ ] Document production setup procedures

#### 3.8.2 CI/CD Pipeline Implementation
- [ ] Select CI/CD platform
- [ ] Create build pipeline configuration
- [ ] Implement testing in pipeline
- [ ] Set up staging deployment
- [ ] Configure production deployment
- [ ] Implement rollback procedures
- [ ] Add deployment notifications
- [ ] Create deployment documentation
- [ ] Set up version tagging process
- [ ] Implement artifact storage
- [ ] Test full CI/CD workflow

#### 3.8.3 App Store Submission Preparation
- [ ] Create app listing details
- [ ] Prepare screenshots and demo video
- [ ] Write comprehensive app description
- [ ] Create feature list and highlights
- [ ] Draft privacy policy
- [ ] Create terms of service document
- [ ] Implement required Shopify app review changes
- [ ] Complete app review questionnaire
- [ ] Prepare responses to common review questions
- [ ] Create post-approval marketing plan
- [ ] Document submission process and timeline

## 4. Local Development Guide

### 4.1 Prerequisites
- Node.js (v18.20+ or v20.10+)
- Docker and Docker Compose
- Shopify CLI
- Shopify Partner account with development store
- GitHub account (for Replicate deployment)
- Replicate account with API access

### 4.2 Initial Setup

1. Clone the repository:
```bash
git clone [repository-url]
cd voice-ai-assistant
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Fill in all required values for local development

4. Set up the database:
```bash
npm run setup
```

5. Start the LiveKit proxy server:
```bash
npm run start:livekit-proxy:docker
```

6. Start the development server:
```bash
npm run dev
```

### 4.3 Ultravox Model Deployment (Development)

1. Navigate to the ultravox-backend directory:
```bash
cd ultravox-backend
```

2. Install Cog:
```bash
pip install cog
```

3. Test the model locally:
```bash
cog predict -i command="Show me products" -i audio="[base64-audio]"
```

4. Deploy to Replicate:
```bash
cog push r8.im/your-username/voice-assistant
```

5. Update the ULTRAVOX_MODEL_VERSION in your .env file with the new version ID.

### 4.4 Development Workflow

1. Make changes to the code
2. Test changes locally using the development server
3. Run tests to ensure functionality
4. Commit changes with descriptive commit messages
5. Push changes to the repository
6. Deploy to staging environment for testing
7. Deploy to production when ready

### 4.5 Troubleshooting

#### Common Issues and Solutions

- **LiveKit Connection Issues**: 
  - Check Docker container is running: `docker ps`
  - Verify WebSocket URL is correct in .env
  - Check browser console for connection errors

- **Microphone Access Problems**:
  - Ensure site is using HTTPS or localhost
  - Check browser permissions
  - Verify proper error handling in code

- **Replicate API Issues**:
  - Verify API token is correct
  - Check rate limits
  - Ensure model version is available

- **Shopify App Connection Problems**:
  - Verify API credentials
  - Check Shopify App Bridge configuration
  - Confirm app URL is correctly set in Shopify Partner Dashboard