require("dotenv").config();
const express = require("express");
const multer = require("multer");
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const MODEL_NAME = "gemini-1.5-pro";
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("API_KEY is not defined in environment variables.");
  process.exit(1);
}

// Set up the view engine and static files
app.set("view engine", "ejs");
app.set("views", `${__dirname}/views`);
app.use(express.static(`${__dirname}/public`));

// Route to render the index page
app.get("/", (req, res) => {
  res.render("index", { bioInfo: null });
});

// Route to handle image upload and processing
app.post("/upload", upload.single("image"), async (req, res) => {
  const imageBuffer = req.file ? req.file.buffer : null;

  if (!imageBuffer) {
    return res.status(400).json({ error: "No image file provided" });
  }

  try {
    const bioInfo = await getbioInfo(imageBuffer);

    if (bioInfo.error) {
      return res.status(400).json({ error: bioInfo.error });
    } else {
      bioInfo.imageBase64 = imageBuffer.toString("base64");
      return res.json({ bioInfo });
    }
  } catch (error) {
    console.error("Error processing the image:", error);

    if (error.name === "GoogleGenerativeAIFetchError") {
      return res.status(500).json({
        error: "A server error occurred at Google's API. Please retry later."
      });
    } else {
      return res.status(500).json({
        error: "An unexpected error occurred on the server."
      });
    }
  }
});

// Function to process the image using the Google Generative AI API
const getbioInfo = async (imageBuffer) => {
  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const generationConfig = {
    temperature: 0.9,
    topK: 32,
    topP: 0.95,
    maxOutputTokens: 1024,
  };

  const safetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
  ];

  const parts = [
    {
      text: `Analyze the image to diagnose plant or animal diseases. Respond in JSON format:
      {
        "vehicle": {
          "manufacturer": "plant" or "animal" or "human",
          "model": "name of disease",
          "color": "cure in 200 words.",
          "year": "cause in 200 words."
        }
      }
      If the image does not contain a plant or animal, respond:
      {
        "error": "The image does not contain a plant or animal."
      }`,
    },
    {
      inlineData: imageBuffer.toString("base64"),
    },
  ];

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
      generationConfig,
      safetySettings,
    });

    const responseText = result.response?.text || "{}"; // Handle undefined response gracefully
    return JSON.parse(responseText.replace(/```json|```/g, ""));
  } catch (error) {
    console.error("Error while parsing the API response:", error);
    throw error;
  }
};

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`App is running on port ${port}`);
});
