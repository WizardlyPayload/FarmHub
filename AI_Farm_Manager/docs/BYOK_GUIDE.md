# How to Use the AI Farm Manager for FREE (BYOK Guide)

Farm Dashboard includes an incredibly powerful AI Farm Manager that acts as your personal Agronomist. To keep the base software free, we use a "Bring Your Own Key" (BYOK) system.

We highly recommend using **Google Gemini**, as it is the model this software was rigorously tested on, and Google provides a generous **Free Tier** for developers.

📹 **Need visual help?** [Watch this quick video tutorial on how to get a Gemini API Key](https://www.youtube.com/watch?v=BYBeQm_AsCI).

### Step 1: Get Your Free Gemini API Key
1. Go to **[Google AI Studio](https://aistudio.google.com/)**.
2. Sign in with your standard Google/Gmail account.
3. Click the **"Get API key"** button on the left-hand menu (or go to `https://aistudio.google.com/app/apikey`).
4. Click **"Create API key"**. If it asks you to select a project, just click "Create a project" and let it use the default Gemini project.
5. Click **"Create key"** and copy the long string of text it generates. Treat this like a password—do not share it with anyone!

### Step 2: Add it to Farm Dashboard
1. Open your Farm Dashboard Desktop App.
2. Navigate to the **Robot/AI Settings Panel**.
3. Under the "AI Provider" dropdown, select **Gemini**.
4. Paste your API key into the "API Key" input field.
5. Hit **Save**.

### How it Works Behind the Scenes
Google's Free Tier has rate limits (Requests Per Minute). If you hit this limit, the Farm Dashboard is smart enough to handle it:
1. **Model Cycling:** If the main model (`gemini-2.5-flash`) is overloaded, the app will automatically try to use an alternative model (like `gemini-1.5-flash`) so your dashboard doesn't break.
2. **Local Fallback:** If you completely exhaust your free quota for the minute, the app will gracefully fall back to our local "Rules Engine" and provide basic agronomic advice until your API key cools down.

*Note: OpenAI (ChatGPT) keys also work in the dashboard, but you must have a funded/paid developer account for them to function, as OpenAI does not offer a perpetual free tier for API access.*
