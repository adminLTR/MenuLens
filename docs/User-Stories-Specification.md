# User Stories Specification

## Actors

- Traveller

## Epics

- Epic 1: Menu Scanning and Capture (Core / MVP)
- Epic 2: Dish Query and Information (Core / MVP)
- Epic 3: Profile and Dietary Personalization
- Epic 4: Offline Features and Saving (Phase 2)

## User Stories

| User Story | Epic | Description | Acceptance criteria |
| ---------- | ---- | ----------- | ------------------- |
| US-01: Menu photo capture | Epic 1 | As a **traveller** at a restaurant, I want to take a quick photo of the physical menu from the app, so the system extracts the text automatically without having to type it manually. | Camera opens in less than 1.5 seconds. Allows turning on flash/torch when lighting is low. Allows retrying or reframing the photo before processing. |
| US-02: OCR text recognition | Epic 1 | As a **traveller**, I want the app to identify dish names in images with complex typography or low light, so I get accurate results. | Recognizes text in horizontal and vertical orientation. Works in more than 30 languages and non-Latin scripts (e.g. Japanese, Cyrillic, Arabic, Thai). |
| US-03: Direct dish selection | Epic 2 | As a **traveller**, I want to tap a specific dish on the detected menu, so I can immediately see its detailed information. | Tapping highlighted text on the photo opens a detail card (bottom sheet / modal). |
| US-04: Detailed dish card in the user’s language | Epic 2 | As a **traveller**, I want to see the dish name translated, a brief cultural description, and a real reference photo, so I know exactly what I am ordering. | Shows the original name and translation in the user’s configured language. Shows at least one high-quality representative photo. Includes a clear 2–3 line explanation of preparation and flavor. |
| US-05: Ingredients, allergens, and nutrition | Epic 2 | As someone with dietary restrictions or who watches their diet, I want to see ingredients, allergen labels, and estimated nutritional values, so I can avoid ingredients that harm me or do not fit my diet. | Shows clear labels for common allergens (gluten, lactose, tree nuts, shellfish, etc.). Shows an estimated calories and macronutrients view, stating that values are approximate. |
| US-06: Dietary preferences and allergies setup | Epic 3 | As a **traveller** with dietary requirements (e.g. vegan, celiac, halal), I want to define my restrictions in my profile, so the app automatically warns me if a dish is not suitable. | Multiple selection for diets (vegetarian, vegan, keto, halal, kosher). Multiple selection for allergies and intolerances. If a dish contains a restricted ingredient, the dish card shows a visible red alert before ordering. |
| US-07: Tried dishes history and favorites | Epic 4 | As a **traveller**, I want to save dishes I liked to favorites and rate them, so I can remember what I ate during my trip. | Option to save a dish to “My Food Diary”. Ability to add a personal note and a 1–5 star rating. |
