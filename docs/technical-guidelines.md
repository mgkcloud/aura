# Voice AI Shopping Assistant - Technical Guidelines

## Development Standards & Best Practices

This document outlines the technical standards, coding conventions, and best practices for developing and maintaining the Voice AI Shopping Assistant Shopify app.

## Table of Contents

1. [Technology Stack](#technology-stack)
2. [Code Organization](#code-organization)
3. [Development Workflow](#development-workflow)
4. [Shopify-Specific Guidelines](#shopify-specific-guidelines)
5. [Theme App Extension Guidelines](#theme-app-extension-guidelines)
6. [Voice Processing Best Practices](#voice-processing-best-practices)
7. [Security Guidelines](#security-guidelines)
8. [Performance Optimization](#performance-optimization)
9. [Testing Standards](#testing-standards)
10. [Documentation Requirements](#documentation-requirements)

## Technology Stack

### Frontend
- **Framework**: React.js with TypeScript
- **UI Framework**: Shopify Polaris components
- **State Management**: React Context API & Hooks
- **Styling**: CSS Modules with SASS
- **Package Manager**: npm

### Backend
- **Runtime**: Node.js 
- **Framework**: Remix.js
- **Database**: Prisma ORM with MySQL/PostgreSQL
- **Authentication**: Shopify OAuth

### AI/Voice Services
- **Speech Recognition**: Web Speech API (client-side) with fallback to cloud-based services
- **Text-to-Speech**: Web Speech API (client-side) with fallback to cloud-based services
- **NLU**: Integration with OpenAI or similar service

### DevOps
- **Version Control**: Git with GitHub
- **CI/CD**: GitHub Actions
- **Hosting**: Vercel or Cloudflare
- **Monitoring**: Sentry for error tracking

## Code Organization

### Directory Structure
```
/
├── app/                       # Main Remix application
│   ├── routes/                # App routes
│   │   ├── app._index.tsx     # Main dashboard
│   │   ├── app.voice-assistant.tsx  # Assistant config
│   │   └── ...
│   ├── components/            # Shared React components
│   ├── hooks/                 # Custom React hooks
│   ├── utils/                 # Utility functions
│   └── services/              # External service integrations
├── extensions/                # Shopify Extensions
│   └── voice-assistant/       # Theme App Extension
│       ├── assets/            # JavaScript and CSS
│       ├── blocks/            # App blocks
│       └── snippets/          # Liquid snippets
├── public/                    # Static assets
├── prisma/                    # Database schema and migrations
└── docs/                      # Project documentation
```

### Naming Conventions
- **Files**: Use kebab-case for filenames (e.g., `voice-assistant.tsx`)
- **Components**: Use PascalCase for component names (e.g., `VoiceButton.tsx`)
- **Functions/Variables**: Use camelCase (e.g., `processVoiceInput`)
- **CSS Classes**: Use kebab-case (e.g., `voice-assistant-container`)
- **Database Tables**: Use snake_case (e.g., `assistant_settings`)

### Coding Style
- Follow ESLint and Prettier configurations
- Prefer functional components with hooks over class components
- Use TypeScript interfaces for props and state
- Organize imports alphabetically
- Include JSDoc comments for public APIs

## Development Workflow

### Git Workflow
1. Create feature branch from `main` using format: `feature/feature-name`
2. Make changes with regular commits following conventional commit format
3. Submit pull request to `main`
4. Require code review before merging
5. Squash and merge to `main`

### Branch Naming
- `feature/feature-name`: For new features
- `fix/bug-description`: For bug fixes
- `refactor/component-name`: For code refactoring
- `docs/document-name`: For documentation updates

### Commit Message Format
Follow conventional commits:
```
type(scope): short description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### Pull Request Process
1. Create a descriptive PR title
2. Complete the PR template
3. Ensure all automated tests pass
4. Request review from at least one team member
5. Address review comments
6. PR can be merged after approval

## Shopify-Specific Guidelines

### App Bridge Integration
- Use `@shopify/app-bridge-react` for admin interface components
- Follow Shopify's App Bridge security practices for authentication
- Use Polaris components for UI consistency

### GraphQL API Usage
- Use the Shopify Admin GraphQL API for admin operations
- Use the Storefront API for customer-facing functionality
- Follow Shopify's rate limiting guidelines
- Implement query batching for complex operations

### Webhook Management
- Register webhooks programmatically during app installation
- Implement proper HMAC verification for webhook security
- Store webhook IDs in the database for tracking

### Session Management
- Use Shopify's recommended session storage approaches
- Implement proper session validation and refresh mechanisms
- Use secure, HTTP-only cookies for session handling

## Theme App Extension Guidelines

### DOM Manipulation
- Minimize direct DOM manipulation
- Use a sandboxed approach to avoid conflicts with the merchant's theme
- Add CSS with namespaced classes to prevent style leakage

### Asset Loading
- Optimize JavaScript and CSS bundle sizes
- Use asynchronous loading for non-critical assets
- Implement code splitting for larger features

### Liquid Integration
- Follow Shopify's Liquid best practices
- Use Liquid variables for dynamic content
- Ensure templates degrade gracefully if JavaScript is disabled

### Responsive Design
- Design for mobile-first
- Test on various screen sizes
- Support touch interactions for mobile devices
- Ensure accessibility on all devices

## Voice Processing Best Practices

### Microphone Access
- Always request explicit permission for microphone access
- Provide clear visual indicators when the microphone is active
- Include visual feedback during voice processing

### Voice Recognition
- Implement proper error handling for speech recognition
- Provide text fallback for all voice interactions
- Consider background noise filtering
- Handle various accents and speech patterns

### Conversation Design
- Create clear conversational flows
- Limit the scope of voice commands to shopping-related activities
- Provide helpful prompts and examples
- Keep responses concise and actionable

### Privacy Considerations
- Do not store raw voice data
- Process voice data client-side when possible
- Be transparent about data handling in privacy policy
- Comply with regional privacy regulations

## Security Guidelines

### Authentication
- Use Shopify's OAuth for authentication
- Implement proper token validation and refresh
- Store tokens securely using environment variables

### Data Protection
- Never expose API keys in client-side code
- Encrypt sensitive data in transit and at rest
- Implement proper CORS policies
- Apply the principle of least privilege for API access

### Input Validation
- Validate all user inputs, including voice transcriptions
- Sanitize data before processing or storage
- Use parameterized queries for database operations
- Implement rate limiting for API endpoints

### Error Handling
- Use generic error messages for users
- Log detailed errors for debugging (without sensitive data)
- Implement proper exception handling
- Avoid exposing stack traces in production

## Performance Optimization

### Frontend Performance
- Use lazy loading for non-critical components
- Implement proper caching strategies
- Optimize images and assets
- Use code splitting to reduce initial load time

### Voice Processing Optimization
- Use streaming for voice input when possible
- Implement debouncing for continuous voice input
- Process voice data in chunks for better performance
- Use web workers for intensive processing tasks

### Network Optimization
- Minimize API calls
- Implement batch operations
- Use compression for API responses
- Cache frequently accessed data

### Monitoring
- Track key performance metrics
- Set up alerts for performance degradation
- Implement logging for critical operations
- Use analytics to identify optimization opportunities

## Testing Standards

### Unit Testing
- Achieve minimum 80% code coverage
- Use Jest for JavaScript/TypeScript testing
- Mock external services and API calls
- Focus on testing business logic and utility functions

### Integration Testing
- Test API integration points
- Verify Shopify API interactions
- Test database operations
- Ensure proper error handling

### UI Testing
- Test component rendering and interactions
- Verify accessibility compliance
- Test responsive design
- Use snapshot testing for UI components

### Voice Testing
- Test voice recognition accuracy with various inputs
- Verify intent matching logic
- Test conversation flows
- Ensure proper error handling for voice processing

## Documentation Requirements

### Code Documentation
- Include JSDoc comments for all public functions and components
- Document complex algorithms and business logic
- Keep comments updated with code changes
- Document known limitations and edge cases

### API Documentation
- Document all API endpoints
- Include request/response examples
- Document error codes and responses
- Keep API documentation in sync with implementation

### User Documentation
- Create clear installation instructions
- Provide configuration guides
- Document available voice commands
- Include troubleshooting information

### Architecture Documentation
- Maintain up-to-date architecture diagrams
- Document system dependencies
- Include deployment procedures
- Document scaling considerations

---

These guidelines will evolve as the project progresses. All team members are encouraged to propose improvements to these standards through pull requests to the documentation. 