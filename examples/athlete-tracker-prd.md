# Athlete Performance Tracker

## Overview

A web portal for high school personal trainers to manage athletes across multiple sports (powerlifting, football, baseball, basketball). Track training plans, performance metrics, diet/nutrition, and progress over time.

## System Actors

- **Head Trainer** — Creates training plans, assigns athletes, views all data, manages the system
- **Assistant Trainer** — Views assigned athletes, logs workouts and performance data
- **Athlete** — Views own training plan, logs meals, sees progress charts (read-only for plans)
- **REST API** — Backend providing all data (built by api-generator-agent)

## Data Model

### Athlete
- id: string (ULID)
- firstName: string
- lastName: string
- email: string
- phone: string
- sport: 'powerlifting' | 'football' | 'baseball' | 'basketball'
- position: string (e.g., "Quarterback", "Catcher", "Point Guard")
- grade: 9 | 10 | 11 | 12
- height: number (inches)
- weight: number (lbs)
- profilePhotoUrl: string
- assignedTrainerId: string (FK -> Trainer)
- status: 'active' | 'injured' | 'offseason' | 'graduated'
- createdAt: Date
- updatedAt: Date

### Trainer
- id: string (ULID)
- firstName: string
- lastName: string
- email: string
- role: 'head' | 'assistant'
- sports: string[] (sports they coach)
- avatarUrl: string

### TrainingPlan
- id: string (ULID)
- athleteId: string (FK -> Athlete)
- name: string
- sport: string
- phase: 'offseason' | 'preseason' | 'inseason' | 'postseason'
- startDate: Date
- endDate: Date
- weeklySchedule: WeeklySchedule
- notes: string
- createdBy: string (FK -> Trainer)

### WorkoutSession
- id: string (ULID)
- athleteId: string (FK -> Athlete)
- trainingPlanId: string (FK -> TrainingPlan)
- date: Date
- type: 'strength' | 'conditioning' | 'sport-specific' | 'recovery'
- exercises: Exercise[]
- duration: number (minutes)
- rpe: number (1-10 rating of perceived exertion)
- trainerNotes: string
- completedAt: Date

### Exercise
- name: string
- sets: number
- reps: number
- weight: number (lbs)
- restPeriod: number (seconds)
- actualSets: number
- actualReps: number
- actualWeight: number
- pr: boolean (personal record)

### PerformanceMetric
- id: string (ULID)
- athleteId: string (FK -> Athlete)
- date: Date
- category: 'strength' | 'speed' | 'agility' | 'endurance' | 'body-composition'
- name: string (e.g., "Bench Press 1RM", "40-Yard Dash", "Vertical Jump", "Body Fat %")
- value: number
- unit: string (e.g., "lbs", "seconds", "inches", "%")
- previousValue: number
- isPersonalRecord: boolean

### MealLog
- id: string (ULID)
- athleteId: string (FK -> Athlete)
- date: Date
- mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'pre-workout' | 'post-workout'
- foods: FoodEntry[]
- totalCalories: number
- totalProtein: number (grams)
- totalCarbs: number (grams)
- totalFat: number (grams)
- photo: string (optional)
- notes: string

### FoodEntry
- name: string
- servingSize: string
- calories: number
- protein: number
- carbs: number
- fat: number

### DietPlan
- id: string (ULID)
- athleteId: string (FK -> Athlete)
- name: string
- dailyCalorieTarget: number
- proteinTarget: number
- carbTarget: number
- fatTarget: number
- mealGuidelines: string
- restrictions: string[]
- createdBy: string (FK -> Trainer)

## Pages & Components

### Login Page
- Email/password login form
- Role-based redirect after login (trainer → dashboard, athlete → my-profile)

### Trainer Dashboard (main page)
- Summary cards: total athletes, active plans, upcoming sessions, PRs this week
- Quick-access athlete list grouped by sport with search/filter
- Today's scheduled sessions timeline
- Recent activity feed (workout completions, new PRs, missed sessions)
- Chart: athlete progress across sports (bar chart by sport)

### Athlete Roster Page
- Data table with all athletes
- Columns: name, sport, position, grade, status, assigned trainer
- Filters: sport, grade, status, trainer
- Search by name
- Bulk actions: assign trainer, change status
- Click row → Athlete Detail

### Athlete Detail Page
- Profile header: photo, name, sport, position, grade, height/weight, status badge
- Tab navigation:
  - **Overview** — current training plan summary, recent metrics, diet adherence
  - **Training** — training plan calendar view, workout history list
  - **Performance** — metrics dashboard with line charts over time, PR board
  - **Nutrition** — meal log table, daily macro breakdown chart, diet plan compliance
  - **Notes** — trainer notes timeline

### Training Plan Builder
- Form to create/edit training plans
- Weekly schedule grid (Mon-Sun × AM/PM)
- Drag-and-drop exercise assignment
- Exercise library search with autocomplete
- Phase selector (offseason/preseason/inseason/postseason)
- Preview mode

### Workout Logger
- Select athlete and date
- Load exercises from training plan
- Log sets/reps/weight for each exercise
- RPE slider (1-10)
- Auto-detect PRs (compare to previous best)
- Trainer notes textarea
- Save and complete

### Performance Dashboard
- Sport-specific metric cards (e.g., powerlifting: squat/bench/deadlift 1RM totals)
- Line charts: metric progress over time (selectable metrics)
- PR Board: recent personal records with celebration styling
- Comparison view: compare two athletes side-by-side
- Export data to CSV

### Nutrition Tracker
- Daily meal log form (add meals/foods with macros)
- Daily macro pie chart (protein/carbs/fat breakdown)
- Weekly calorie trend line chart
- Diet plan compliance gauge (actual vs target)
- Quick-add common foods

### Settings Page
- Trainer profile (name, email, avatar)
- Sport management (add/remove sports you coach)
- Exercise library management
- Notification preferences
- Theme toggle (light/dark)

## Key Workflows

### Log a Workout
1. Trainer selects athlete from roster or dashboard
2. System loads today's planned exercises from training plan
3. Trainer logs actual sets, reps, weight for each exercise
4. System auto-flags any personal records
5. Trainer adds RPE and notes
6. Workout saved and athlete's progress metrics updated

### Track Diet Compliance
1. Athlete logs meals throughout the day (or trainer logs for them)
2. System calculates running daily totals (calories, macros)
3. Dashboard shows compliance vs. diet plan targets
4. Weekly summary shows trends (surplus/deficit days)

## API Endpoints (consumed)

### Auth
- POST /api/v1/auth/login
- POST /api/v1/auth/logout
- GET /api/v1/auth/me

### Athletes
- GET /api/v1/athletes
- GET /api/v1/athletes/:id
- POST /api/v1/athletes
- PUT /api/v1/athletes/:id
- DELETE /api/v1/athletes/:id

### Training Plans
- GET /api/v1/athletes/:id/training-plans
- POST /api/v1/training-plans
- PUT /api/v1/training-plans/:id
- DELETE /api/v1/training-plans/:id

### Workouts
- GET /api/v1/athletes/:id/workouts
- POST /api/v1/workouts
- PUT /api/v1/workouts/:id

### Performance Metrics
- GET /api/v1/athletes/:id/metrics
- POST /api/v1/metrics
- GET /api/v1/athletes/:id/metrics/:name/history

### Nutrition
- GET /api/v1/athletes/:id/meals
- POST /api/v1/meals
- PUT /api/v1/meals/:id
- GET /api/v1/athletes/:id/diet-plan
- POST /api/v1/diet-plans
- PUT /api/v1/diet-plans/:id

### Trainers
- GET /api/v1/trainers
- GET /api/v1/trainers/:id

## Non-Functional Requirements

- Mobile-friendly responsive design (trainers use tablets on the gym floor)
- Dark mode support
- Loading skeletons for all async content
- Offline-capable workout logger (sync when back online)
- Fast load times (lazy-loaded routes per feature)
- Accessible (ARIA labels, keyboard navigation)
- Print-friendly athlete reports
