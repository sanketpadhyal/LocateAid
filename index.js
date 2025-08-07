const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;
const GEOAPIFY_KEY = ""; // Enter your API ID here
const ADMIN_PASSWORD = "sanket"; // Enter password here

app.use(cors());
app.use(express.json());
app.use(express.static("public")); // Serve admin.html and other frontend files

// Fetch Emergency Services Geoapify + local JSON
app.get("/api/getEmergency", async (req, res) => {
  const city = req.query.city?.toLowerCase();
  let lat = req.query.lat;
  let lng = req.query.lng;

  // Local file check
  let localResults = [];
  if (city) {
    const filePath = path.join(__dirname, `${city}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const localData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (Array.isArray(localData)) {
          localResults = localData;
        }
      } catch (e) {
        return res.status(500).json({ error: "Invalid local data." });
      }
    }
  }

  // Convert city to coordinates if needed
  if (!lat || !lng) {
    if (city) {
      try {
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?city=${city}&format=json&limit=1`;
        const nomRes = await axios.get(nominatimUrl, {
          headers: { "User-Agent": "LocateAid/1.0" },
        });
        if (nomRes.data.length > 0) {
          lat = nomRes.data[0].lat;
          lng = nomRes.data[0].lon;
        } else {
          return res.json({ source: "local", places: localResults });
        }
      } catch (err) {
        return res.status(500).json({ error: "Nominatim failed." });
      }
    }
  }

  // Geoapify fetch
  let apiResults = [];
  if (lat && lng) {
    const radius = 5000;
    const categories = [
      "service.fire_station",
      "healthcare.hospital",
      "service.police",
    ].join(",");

    const apiUrl = `https://api.geoapify.com/v2/places?categories=${categories}&filter=circle:${lng},${lat},${radius}&limit=20&apiKey=${GEOAPIFY_KEY}`;

    try {
      const response = await axios.get(apiUrl);
      const features = response.data.features;

      apiResults = features.map((f) => ({
        name: f.properties.name || "Unnamed",
        type: f.properties.categories?.[0] || "Emergency",
        address: f.properties.formatted || "No address",
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
      }));
    } catch (err) {
      console.error("Geoapify error:", err.message);
    }
  }

  const allResults = [...apiResults, ...localResults];
  return res.json({
    source: allResults.length > 0 ? "merged" : "none",
    places: allResults,
  });
});

// Admin login
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: "Password required." });

  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true });
  } else {
    return res.status(401).json({ error: "Wrong password." });
  }
});

// Admin Add or append city data
app.post("/api/admin/addCity", (req, res) => {
  const { city, data, password } = req.body;

  if (!city || !Array.isArray(data)) {
    return res.status(400).json({ error: "City and valid data required." });
  }

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  const filePath = path.join(__dirname, `${city.toLowerCase()}.json`);
  let existingData = [];

  // Merge existing data if present
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      existingData = JSON.parse(raw);
      if (!Array.isArray(existingData)) {
        existingData = [];
      }
    } catch (e) {
      console.error("Error reading existing data:", e.message);
    }
  }

  const merged = [...existingData, ...data];
  try {
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2));
    return res.json({
      success: true,
      message: `City '${city}' updated with ${data.length} service(s).`,
    });
  } catch (e) {
    return res.status(500).json({ error: "Failed to save city data." });
  }
});

// Root route
app.get("/", (req, res) => {
  res.send("LocateAid 🚑 backend is live.");
});

app.listen(PORT, () => {
  console.log(`LocateAid 🚑 server running on port ${PORT}`);
});
