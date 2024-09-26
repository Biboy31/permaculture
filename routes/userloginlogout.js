const express = require("express");
const bcrypt = require("bcryptjs");
const isAuthenticated = require('../middleware/athenticateUser');
const User = require("../models/user");
const axios = require('axios');
const Plant = require("../models/Plant"); 
const app = express();

require("dotenv").config();

app.post('/complete-tutorial', isAuthenticated, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.session.userId, { doneToturial: true });
    res.redirect('/dashboard');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error completing the tutorial');
  }
});

app.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
    
    const user = await User.findById(req.session.userId);

    if (!user) {
      return res.status(404).send('User not found');
    }

    if (user.doneToturial === "false") {
      return res.render('tutorial');
    }

    const lat = 14.163742603744133;
    const lon = 122.88500203498731; 
    const currentWeatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${process.env.WEATHER_API}&units=metric`;
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${process.env.WEATHER_API}&units=metric`;

    const filter = req.query.filter;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    let query = { userId: req.session.userId };

    if (filter) {
      query.type = filter;
    }

    // Fetch weather data and plants data
    const [currentWeatherResponse, forecastResponse, plants] = await Promise.all([
      axios.get(currentWeatherUrl),
      axios.get(forecastUrl),
      Plant.find(query)
      .populate('location')  // Populate the location field
      .skip(skip)
      .limit(limit)
      .sort({ plantingDate: -1 }),
    ]);

    const weatherData = currentWeatherResponse.data;
    const forecastData = forecastResponse.data.list;

    const dailyForecasts = forecastData.filter((entry) => entry.dt_txt.includes("12:00:00"));

    const currentDate = new Date();
    const growthStages = [
      { stage: "Sprout", days: 7 },
      { stage: "Seedling", days: 14 },
      { stage: "Vegetating", days: 30 },
      { stage: "Budding", days: 45 },
      { stage: "Flowering", days: 60 },
      { stage: "Ripening", days: 75 },
      { stage: "Harvesting", days: 90 }
    ];

    const updatedPlants = plants.map(plant => {
      const plantingDate = new Date(plant.plantingDate);
      const daysSincePlanting = Math.floor((currentDate - plantingDate) / (1000 * 60 * 60 * 24));

      let currentStage = "Not yet started";
      for (const stage of growthStages) {
        if (daysSincePlanting <= stage.days) {
          currentStage = stage.stage;
          break;
        }
      }

      const lastWatered = new Date(plant.lastWatered || plantingDate);
      const dayDiff = Math.floor((currentDate - lastWatered) / (1000 * 60 * 60 * 24));

      const needsWatering = (plant.wateringSchedule === 'Daily' && dayDiff >= 1) || 
                            (plant.wateringSchedule === 'Every 2 Days' && dayDiff >= 2) || 
                            (plant.wateringSchedule === 'Weekly' && dayDiff >= 7);

      return { 
        ...plant.toObject(), 
        growthStage: currentStage, 
        needsWatering,
        location: plant.location ? plant.location.name : 'Unknown Location'  // Extract location name
      };
    });

    const count = await Plant.countDocuments(query);
    const totalPages = Math.ceil(count / limit);

    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = new Date().toLocaleDateString('en-PH', options);

    const [weekday, month, dayWithComma] = formattedDate.split(', ');

    res.render('index', {
      weather: weatherData,
      plants: updatedPlants,
      forecast: dailyForecasts,
      page,
      totalPages,
      filter,
      name: `${req.session.firstname} ${req.session.lastname}`,
      day: weekday,
      dateToday: `${month}, ${dayWithComma}`
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error retrieving dashboard data");
  }
});



app.post("/login", async (req, res) => {
  
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (user) {
      if (user.status === 'pending') {
        const pendingMessage = "Your account is still under verification.";
        return res.render("login.ejs", { wrongCridentials: pendingMessage });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (isPasswordValid) {
        req.session.userId = user._id;
        req.session.email = user.email;
        req.session.firstname = user.firstname;
        req.session.lastname = user.lastname;
        req.session.profilePicture = user.profilePicture;

        return res.redirect('/dashboard'); // Redirect to dashboard after login
      } 
      else {
        const wrongInfo = "Wrong email or password";
        return res.render("login.ejs", { wrongCridentials: wrongInfo });
      }
    } else {
      const wrongInfo = "Wrong email or password";
      return res.render("login.ejs", { wrongCridentials: wrongInfo });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Error logging in user");
  }
});
 
app.get("/logout", (req, res) => {
     req.session.destroy((err) => {
          if (err) {
               return res.status(500).send("Error logging out");
          }
          res.redirect("/");
     });
});

module.exports = app;
