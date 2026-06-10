# Animated Learning AI

A starter full-stack application for an animated learning chatbot.

## What it does

- Accepts a question from the user.
- Generates a structured animated lesson storyboard.
- Displays the lesson plan, scene cards, a live animated preview, and browser narration.
- Renders a simple MP4 lesson video on the server using FFmpeg.
- Uses OpenAI with `gpt-4.1-mini` for actual storyboard generation when `OPENAI_API_KEY` is configured.
- Falls back to a mocked storyboard generator when no key is present.

## OpenAI schema validation and testing

This project now validates the OpenAI lesson response against a strict JSON schema to ensure production-grade output stability.

Run the OpenAI test flow with:

```bash
npm run test:openai
```

That script calls `gpt-4.1-mini`, validates the result, and prints a sample storyboard response.

## Sample response example

```json
{
  "learningObjective": "Explain photosynthesis through a clear visual story that connects light, plants, and energy.",
  "keyConcepts": [
    "Light energy conversion",
    "Chlorophyll and leaf structure",
    "Oxygen release and plant growth"
  ],
  "storyboard": [
    {
      "number": 1,
      "duration": 6,
      "narration": "Introduce a sunlit leaf absorbing sunlight and turning it into energy.",
      "visualDescription": "A bright sunbeam hits a green leaf, with sparkles showing energy entering the cell.",
      "animationInstructions": "Animate light rays moving into the leaf and turning into glowing particles.",
      "onScreenText": "Light becomes energy"
    },
    {
      "number": 2,
      "duration": 8,
      "narration": "Show how chlorophyll captures sunlight and helps the leaf build food.",
      "visualDescription": "A cross-section of a leaf with chloroplasts lighting up and making sugar molecules.",
      "animationInstructions": "Highlight chloroplasts and animate sugar molecules forming and moving through the leaf.",
      "onScreenText": "Chlorophyll captures light"
    },
    {
      "number": 3,
      "duration": 7,
      "narration": "Close with the plant releasing oxygen and growing stronger.",
      "visualDescription": "Fresh green leaves release bubbles of oxygen while the plant grows taller.",
      "animationInstructions": "Animate oxygen bubbles leaving the leaf and a stem growing upward.",
      "onScreenText": "Oxygen and growth"
    }
  ],
  "memoryAnchors": "Use the image of a leaf turning sunlight into glowing food to make the process memorable.",
  "commonMisconceptions": "Clarify that plants do not eat soil, they use sunlight and carbon dioxide to make food.",
  "finalSummary": "Summarize that photosynthesis is the process plants use to convert light into energy and oxygen."
}
```

## Setup

1. Open the project folder.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a local environment file from the example:

   ```bash
   cp .env.local.example .env.local  # macOS/Linux
   copy .env.local.example .env.local  # Windows PowerShell
   ```

4. Update `.env.local` with your values. At minimum, set:

   ```env
   DATABASE_URL="file:./dev.db"
   NEXTAUTH_URL=http://localhost:3000
   OPENAI_API_KEY=your_api_key_here
   STRIPE_SECRET_KEY=your_stripe_secret_key
   STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
   ```

5. Initialize Prisma and the database:

   ```bash
   npx prisma db push
   npx prisma generate
   ```

6. Start the app:

   ```bash
   npm run dev
   ```

7. Open `http://localhost:3000`.

## Deployment

This app can be deployed on Vercel or any Node.js hosting provider.

### Vercel

- The project includes `vercel.json` for Next.js deployment.
- Deploy from the project root with the Vercel CLI or connect the repository in the Vercel dashboard.

### Notes

- The app can render MP4 videos server-side using FFmpeg.
- Browser narration uses the Web Speech API for live voice playback.
