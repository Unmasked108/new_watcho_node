const express = require('express');
const connectDB = require('./db');
const cors = require('cors');
require('dotenv').config();
const router=require('./routes/User')
const teamsRouter = require('./routes/Teams'); // Import the new teams router
const ordersRouter = require('./routes/Order'); // Import the orders router
// Import the allocation router


const app = express();



// Allow specific origins or all origins
// const corsOptions = {
//     origin: ['https://watcho-123.web.app'], // Replace with your frontend URL
//     methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//     allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
//     credentials: true, // If you're using cookies
// };


// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Limit JSON payload to 10MB
app.use(express.urlencoded({ extended: true })); // Limit URL-encoded payload to 10MB

// Routes
app.use('/',router);
app.use('/api', teamsRouter); // Add the teams router
app.use('/api', ordersRouter); // Add the orders route here





const PORT =  5000;
app.listen(PORT,()=>{
    console.log(`Server is running on http://localhost:${PORT}`);
});

exports.app = app;