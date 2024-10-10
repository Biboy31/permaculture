const express = require("express")
const Email = require("../models/message")
const User = require("../models/user")
const isAuthenticated = require('../middleware/athenticateUser')
const PlantCollection = require('../models/plantCollections');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('../config/cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();


// Configure multer storage for Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'plants', // Cloudinary folder where images will be stored
      allowed_formats: ['jpg', 'png'],
      transformation: [{ width: 500, height: 500, crop: 'limit' }] // Optional image transformations
    }
  });

  const upload = multer({ storage: storage });

// Update the /admin route to fetch plants
app.get("/admin",upload.single('plantImage'), async (req, res) => {
    try {
        // Fetch all emails from the database
        const emails = await Email.find().sort({ dateSent: -1 });
        
        // Fetch all users with status 'pending'
        const pendingUsers = await User.find({ status: 'pending' });

        // Render the admin view with emails, pending users, and plants
        res.render("admin.ejs", { emails, pendingUsers });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error fetching data');
    }
});

app.get("/plant-collection", async(req,res)=>{
      // Fetch all plants from the database
      const plants = await PlantCollection.find();
    
      res.render("adminPlantCollection.ejs", {plants,plantAdded: "Success"});
})

// Route to delete a plant
app.post("/admin/plants/delete/:id", async (req, res) => {
    try {
        await PlantCollection.findByIdAndDelete(req.params.id);
        res.redirect("/plant-collection");
    } catch (err) {
        console.error(err);
        res.status(500).send('Error deleting plant');
    }
});

// Route to update a plant (rendering the edit form)
app.get("/admin/plants/edit/:id", async (req, res) => {
    try {
        const plant = await PlantCollection.findById(req.params.id);
        res.render("editPlant.ejs", { plant });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error fetching plant');
    }
});app.post("/admin/plants/update/:id", upload.single('plantImage'), async (req, res) => {
    const { name, plantingInstructions, harvestTime, plantingMonth, overview, benefits, usedFor, transplantSeedling } = req.body;
    let imageUrl = req.body.existingImage; // Store existing image URL

    if (req.file) {
        imageUrl = req.file.path || req.file.url || req.file.secure_url;
    }

    try {
        // Ensure plantingMonth is an array, even if only one checkbox is checked
        const updatedPlantingMonth = Array.isArray(plantingMonth) ? plantingMonth : [plantingMonth].filter(Boolean);

        await PlantCollection.findByIdAndUpdate(req.params.id, {
            name,
            plantingInstructions,
            harvestTime,
            plantingMonth: updatedPlantingMonth,
            image: imageUrl, // Use the updated or existing image URL
            overview,
            benefits,
            usedFor,
            transplantSeedling
        });
        res.redirect("/plant-collection");
    } catch (error) {
        console.error(error);
        res.status(500).send("Error updating plant");
    }
});

app.post('/add-plant', upload.single('plantImage'), async (req, res) => {
    const { name, plantingInstructions, harvestTime, plantingMonth, overview, benefits, usedFor,transplantSeedling } = req.body;
  
    // Ensure plantingMonth is an array
    const plantingMonthsArray = Array.isArray(plantingMonth) ? plantingMonth : [plantingMonth].filter(Boolean);

    console.log(req.file);

    const imageUrl = req.file.path || req.file.url || req.file.secure_url; // Cloudinary URL

    // Check if the imageUrl is defined
    if (!imageUrl) {
        throw new Error('Image URL is missing');
    }

    try {
        const newPlant = new PlantCollection({
            name,
            plantingInstructions,
            harvestTime,
            image: imageUrl,
            plantingMonth: plantingMonthsArray,
            overview,
            benefits,
            usedFor,
            transplantSeedling
        });
  
        await newPlant.save();
        res.redirect('/plant-collection'); // Redirect back to the admin page or wherever you want
    } catch (error) {
        console.error(error);
        res.status(500).send("Error adding plant to collection");
    }
});


app.post("/admin/verify-user/:id", async (req, res) => {
    try {
        // Update the user's status to 'verified'
        await User.findByIdAndUpdate(req.params.id, { status: 'verified' });
        res.redirect("/admin");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error verifying user");
    }
});

// Route to reject a user
app.post("/admin/reject-user/:id", async (req, res) => {
    try {
        // Update the user's status to 'rejected'
        await User.findByIdAndUpdate(req.params.id, { status: 'rejected' });
        res.redirect("/admin");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error rejecting user");
    }
});

// Route to view an email and mark it as read
app.get('/admin/email/:id', async (req, res) => {
    try 
        {
            const email = await Email.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
            res.render('viewEmail.ejs', { email });
        } 
    catch (err) 
        {
            console.error(err);
            res.status(500).send('Error fetching email');
        }
});


app.get("/email",isAuthenticated, (req, res)=>{
    res.render("email.ejs", {name: req.session.firstname + " "+ req.session.lastname, email: req.session.email, profilePicture: req.session.profilePicture});
})

app.post("/admin/emails/delete/:id", async (req, res) => {
    try 
        {
            const emailId = req.params.id;
            await Email.findByIdAndDelete(emailId);
            res.redirect("/admin/emails/");
        } 
    catch (err) 
        {
            console.error(err);
            res.status(500).send('Error deleting email');
        }
});

app.post('/send-mail',isAuthenticated, async(req, res)=>{
    const { name, email, subject, message, profilePicture } = req.body;
    const reciepients = `${name} <${email}>`;

    try 
        {
            res.locals.emailSent = "Email Sent";
            const emailSent = req.session.emailSent;

            await Email({ reciepients, subject, message });
            
            // Save the email details to the database
            const newEmail = new Email({ name, email, subject, message, profilePicture });
            await newEmail.save();
            

            req.flash('success', 'Email sent successfully!');
            res.redirect('/email'); // Redirecting to the email page
        } 
    catch (err) 
        {
            console.error('Error sending email:', error);
            req.flash('error', 'Error sending email. Please try again.');
            res.redirect('/email'); // Redirect to the same page with an error message
        }
        
})

app.post("/clear-email-session", (req, res) => {
    delete req.session.emailSent;
    res.json({ success: true });
});

module.exports = app;