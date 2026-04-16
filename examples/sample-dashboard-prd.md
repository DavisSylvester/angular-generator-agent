# Analytics Dashboard

## Overview

A responsive analytics dashboard built with Angular. Displays real-time metrics, charts, and data tables for monitoring business KPIs. Connects to a REST API for data.

## System Actors

- **Analyst** — Views dashboards, applies filters, exports data
- **Admin** — Manages dashboard layouts, user access
- **REST API** — Backend providing metrics and aggregations

## Architecture

### Frontend

- **Angular 19+** standalone components
- **Angular Material** for UI components
- **SCSS** with CSS variables for theming
- **RxJS** for HTTP streams
- **Signals** for local state

## Data Model

### User
- id: string (ULID)
- email: string
- name: string
- role: 'analyst' | 'admin'
- avatarUrl: string

### Dashboard
- id: string (ULID)
- name: string
- description: string
- ownerId: string (FK -> User)
- isDefault: boolean
- createdAt: Date
- updatedAt: Date

### Widget
- id: string (ULID)
- dashboardId: string (FK -> Dashboard)
- type: 'metric-card' | 'line-chart' | 'bar-chart' | 'pie-chart' | 'data-table'
- title: string
- config: WidgetConfig
- position: { x: number, y: number, width: number, height: number }

### MetricSnapshot
- id: string (ULID)
- name: string
- value: number
- previousValue: number
- unit: string
- trend: 'up' | 'down' | 'stable'
- timestamp: Date

## Pages & Components

### Login Page
- Email/password form
- "Remember me" checkbox
- Redirect to dashboard on success

### Dashboard Page (main)
- Top toolbar with dashboard selector dropdown, date range picker, refresh button
- Grid of widgets (metric cards, charts, tables)
- Responsive: 4 columns desktop, 2 tablet, 1 mobile
- Each widget is a standalone component

### Metric Card Widget
- Large number display with unit
- Trend indicator (arrow up/down with color)
- Sparkline mini-chart
- Comparison to previous period (percentage change)

### Chart Widget
- Supports line, bar, and pie chart types
- Configurable time range
- Hover tooltips with data points
- Legend with toggle

### Data Table Widget
- Sortable columns
- Pagination
- Search/filter row
- Export to CSV button

### Settings Page
- Profile section (name, email, avatar)
- Theme toggle (light/dark)
- Notification preferences

### Admin Page (admin only)
- User management table (list, invite, remove)
- Dashboard management (create, clone, delete)

## API Endpoints (consumed)

### Auth
- POST /api/v1/auth/login
- POST /api/v1/auth/logout
- GET /api/v1/auth/me

### Dashboards
- GET /api/v1/dashboards
- GET /api/v1/dashboards/:id
- POST /api/v1/dashboards
- PUT /api/v1/dashboards/:id
- DELETE /api/v1/dashboards/:id

### Widgets
- GET /api/v1/dashboards/:id/widgets
- POST /api/v1/dashboards/:id/widgets
- PUT /api/v1/widgets/:id
- DELETE /api/v1/widgets/:id

### Metrics
- GET /api/v1/metrics?range=7d
- GET /api/v1/metrics/:name/history?from=&to=

### Users (admin)
- GET /api/v1/users
- POST /api/v1/users/invite
- DELETE /api/v1/users/:id

## Key Workflows

### Dashboard Load
1. App loads, checks auth token
2. If no token, redirect to login
3. Fetch default dashboard
4. Fetch widgets for dashboard
5. Each widget fetches its own data (metric, chart data, or table data)
6. Display loading skeletons while fetching

### Theme Switching
1. User toggles theme in settings
2. CSS variables update globally
3. Preference saved to localStorage
4. Applied on next app load

## Non-Functional Requirements

- Mobile-first responsive design
- Dark mode support
- Loading skeletons for all async content
- Error boundaries with retry buttons
- Accessible (ARIA labels on interactive elements)
