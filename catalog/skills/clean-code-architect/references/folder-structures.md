# Folder Structure Templates

## React / React Native

```
src/
├── core/
│   ├── utilities/          # Pure helper functions
│   ├── validators/         # Validation schemas (zod, yup)
│   ├── constants/          # App-wide constants
│   ├── hooks/              # Shared custom hooks
│   └── types/              # Shared TypeScript types
├── services/
│   ├── api/                # API client, endpoints
│   ├── storage/            # Local storage, cache
│   └── analytics/          # Tracking services
├── features/
│   └── {feature}/
│       ├── components/     # Feature UI
│       ├── hooks/          # Feature hooks
│       ├── services/       # Feature API calls
│       ├── types/          # Feature types
│       └── index.ts        # Public exports
├── ui/
│   ├── atoms/
│   │   ├── Button/
│   │   ├── Input/
│   │   └── Text/
│   ├── molecules/
│   │   ├── FormField/
│   │   └── SearchBar/
│   ├── organisms/
│   │   ├── Header/
│   │   └── LoginForm/
│   └── templates/
│       ├── MainLayout/
│       └── AuthLayout/
├── navigation/             # React Navigation setup
├── screens/                # Screen components (pages)
└── App.tsx
```

## Swift / iOS

```
Sources/
├── Core/
│   ├── Utilities/          # Extensions, helpers
│   ├── Validators/         # Input validation
│   ├── Constants/          # App constants
│   └── Protocols/          # Shared protocols
├── Services/
│   ├── Network/            # API client
│   │   ├── NetworkService.swift
│   │   ├── Endpoints/
│   │   └── Models/         # DTOs
│   ├── Storage/            # UserDefaults, Keychain
│   └── Analytics/
├── Domain/
│   ├── Models/             # Domain entities
│   ├── Repositories/       # Repository protocols
│   └── UseCases/           # Business logic
├── Features/
│   └── {Feature}/
│       ├── Views/          # SwiftUI views
│       ├── ViewModels/     # ObservableObjects
│       ├── Models/         # Feature-specific models
│       └── Services/       # Feature services
├── UI/
│   ├── Atoms/
│   │   ├── PrimaryButton.swift
│   │   └── TextStyles.swift
│   ├── Molecules/
│   │   └── FormField.swift
│   ├── Organisms/
│   │   └── HeaderView.swift
│   └── Templates/
│       └── MainTemplate.swift
├── Navigation/
│   └── AppCoordinator.swift
└── App/
    └── AppDelegate.swift
```

## Node.js / TypeScript Backend

```
src/
├── core/
│   ├── utilities/          # Helper functions
│   ├── validators/         # Validation schemas
│   ├── constants/          # App constants
│   ├── errors/             # Custom error classes
│   └── types/              # Shared types
├── infrastructure/
│   ├── database/           # DB connection, migrations
│   ├── cache/              # Redis, caching
│   ├── queue/              # Job queues
│   └── logging/            # Logger setup
├── services/
│   ├── auth/               # Authentication
│   ├── email/              # Email sending
│   └── storage/            # File storage
├── domain/
│   └── {entity}/
│       ├── entity.ts       # Domain model
│       ├── repository.ts   # Data access
│       └── service.ts      # Business logic
├── features/
│   └── {feature}/
│       ├── controller.ts   # HTTP handlers
│       ├── routes.ts       # Route definitions
│       ├── dto.ts          # Request/Response types
│       ├── service.ts      # Feature logic
│       └── validators.ts   # Request validation
├── middleware/
│   ├── auth.ts
│   ├── errorHandler.ts
│   └── validation.ts
└── app.ts
```

## Python / FastAPI

```
src/
├── core/
│   ├── utilities/          # Helper functions
│   ├── validators/         # Pydantic validators
│   ├── constants.py        # App constants
│   └── exceptions.py       # Custom exceptions
├── infrastructure/
│   ├── database/
│   │   ├── connection.py
│   │   └── migrations/
│   ├── cache/
│   └── external/           # Third-party integrations
├── services/
│   ├── auth/
│   ├── email/
│   └── storage/
├── domain/
│   └── {entity}/
│       ├── models.py       # SQLAlchemy models
│       ├── schemas.py      # Pydantic schemas
│       ├── repository.py   # Data access
│       └── service.py      # Business logic
├── features/
│   └── {feature}/
│       ├── router.py       # FastAPI router
│       ├── schemas.py      # Request/Response
│       ├── service.py      # Feature logic
│       └── dependencies.py # Dependency injection
├── middleware/
│   ├── auth.py
│   └── error_handler.py
└── main.py
```

## Vapor / Swift Backend

```
Sources/App/
├── Core/
│   ├── Utilities/
│   ├── Validators/
│   ├── Constants/
│   └── Errors/
├── Infrastructure/
│   ├── Database/
│   │   ├── Migrations/
│   │   └── configure.swift
│   ├── Cache/
│   └── External/
├── Services/
│   ├── Auth/
│   ├── Email/
│   └── Storage/
├── Domain/
│   └── {Entity}/
│       ├── {Entity}.swift      # Fluent model
│       ├── {Entity}DTO.swift   # Data transfer
│       ├── {Entity}Repository.swift
│       └── {Entity}Service.swift
├── Features/
│   └── {Feature}/
│       ├── {Feature}Controller.swift
│       ├── {Feature}Routes.swift
│       ├── DTOs/
│       └── Validators/
├── Middleware/
│   ├── AuthMiddleware.swift
│   └── ErrorMiddleware.swift
└── routes.swift
```

## Component File Structure

For any component-based architecture:

```
ComponentName/
├── ComponentName.tsx       # Main component
├── ComponentName.styles.ts # Styles (or .css/.scss)
├── ComponentName.test.ts   # Tests
├── ComponentName.types.ts  # TypeScript interfaces
├── useComponentName.ts     # Component-specific hook
└── index.ts                # Public exports
```

Or flat for simpler components:
```
ComponentName/
├── index.tsx               # Component + exports
└── styles.ts               # Styles
```
