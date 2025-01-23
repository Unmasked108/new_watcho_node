const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/user');
const router = express.Router();
const jwt=require("jsonwebtoken");
const { authenticateToken } = require('./Jwt');
const axios = require('axios');
const https = require('https');

const Subscription = require('../models/subscription'); // Update the path as needed

JWT_SECRET="679992956"
const tokenBlacklist = new Set();



// Proxy configuration




  // Function to get IP location

// Function to get IP location


// Register
router.post('/register', async (req, res) => {
  const { name, email, mobile,city,gender, password } = req.body;
  console.log(req.body)
  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const user = new User({
      name,
      email,
      mobile,
      password: await bcrypt.hash(password, 10),
    });

    await user.save();

    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error', error: err });
  }
});

// API endpoint to send OTP

// API endpoint to send OTP
router.get('/sendotp', async (req, res) => {
  try {
    const mobileNo = req.query.mobile;
    const email = req.query.email;
    const isSignup = req.query.isSignup === 'true';



    console.log("Mobile",mobileNo)
    console.log("email",email)
    console.log("isSignup", isSignup);
    if (!mobileNo || !email) {
      return res.status(400).json({ error: 'Mobile number and email are required.' });
    }

    // Check if the email or mobile already exists in the database
    if (isSignup) {
      const existingUser = await User.findOne({
        $or: [{ email }, { mobile: mobileNo }],
      });

      if (existingUser) {
        if (existingUser.email === email) {
          return res.status(400).json({ error: 'Email already exists.' });
        }
        if (existingUser.mobile === parseInt(mobileNo, 10)) {
          return res.status(400).json({ error: 'Mobile number already exists.' });
        }
      }
    }
    
    const proxy_auth_oxylab = {
      username: `customer-rastadata-cc-IN-Sessid-${mobileNo}-sesstime-5`,
      //username: customer-Rescale_l9dBf-cc-IN,
      password : 'vRU+70dxYl8='
    }   
        
    const oxyProxy = {
      host:'pr.oxylabs.io',
      port: '7777',
      auth: proxy_auth_oxylab
    };

    const httpsAgent = new https.Agent({
      keepAlive: true,
      rejectUnauthorized: false // Ignore invalid certificate errors
    });
    
    // External API details for authentication token
    const authApiUrl = 'https://plans-offers-api-ap1.watcho.com/api/v1/flexi-plan-login/generateAuthenticationToken';
    const authHeaders = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Origin': 'https://plans-offers.watcho.com',
      'Referer': 'https://plans-offers.watcho.com/',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };

    console.log("Sending request to auth API via proxy...");

    // Fetch the authentication token using proxy
    const authResponse = await axios.post(authApiUrl, { MobileNo: mobileNo }, { 
      headers: authHeaders,
      httpsAgent // Using proxy,
      // proxy: oxyProxy
    });

    console.log("Auth API response:", authResponse.data);

    if (!authResponse.data || !authResponse.data.result) {
      throw new Error('Failed to fetch authentication token.');
    }

    const authToken = authResponse.data.result;

    // External API details for OTP generation
    const otpApiUrl = 'https://plans-offers-api-ap1.watcho.com/api/v1/flexi-plan-login/generateOTPForLogin';
    const otpHeaders = {
      ...authHeaders,
      'auth_token': authToken, // Include the dynamic auth token
    };

    console.log("Sending request to OTP API via proxy...");

    // Generate OTP using proxy
    const otpResponse = await axios.post(otpApiUrl, { MobileNo: mobileNo }, { 
      headers: otpHeaders,
      httpsAgent // Using proxy,
      // proxy: oxyProxy
    });

    console.log("OTP API response:", otpResponse.data);
    

    let user = await User.findOne({ email:email });
    if (user && !user.mobile) {
      user.mobile = mobileNo; // Update the mobile number for the existing user
      await user.save();
      console.log("Updated user record with mobile number:", mobileNo);
    }


    // Forward the OTP API response to the frontend
    res.json({ otpSent: true, mobileNo, authToken }); // Return authToken and mobile to client
  } catch (error) {
    console.error('Error calling external API via proxy:', error.message);
    res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
});

// API Endpoint to verify OTP
router.post('/verify', async (req, res) => {
 
  try {
    const { otp, mobile, authToken } = req.body;
    // const mobileNumber = Number(mobile);


    console.log("Data received from frontend:", req.body);
  
    if (!otp) return res.status(400).json({ message: 'OTP is required' });
  
    const proxy_auth_oxylab = {
      username: `customer-rastadata-cc-IN-Sessid-${mobile}-sesstime-5`,
      //username: customer-Rescale_l9dBf-cc-IN,
      password : 'vRU+70dxYl8='
    }   
        
    const oxyProxy = {
      host:'pr.oxylabs.io',
      port: '7777',
      auth: proxy_auth_oxylab
    };
  
    const httpsAgent = new https.Agent({
      keepAlive: true,
      rejectUnauthorized: false // Ignore invalid certificate errors
    });
    

    console.log("Sending request to OTP verification API via proxy...");

    const response = await axios.post(
      'https://plans-offers-api-ap1.watcho.com/api/v1/flexi-plan-login/validateOTPForLogin',
      { OTP: otp, MobileNo: mobile, Source: 'Web' },
      {
        headers: {
          accept: 'application/json',
          'accept-language': 'en-US,en;q=0.9,hi;q=0.8',
          auth_token: authToken,
          'cache-control': 'no-cache',
          'content-type': 'application/json',
          origin: 'https://plans-offers.watcho.com',
          pragma: 'no-cache',
          referer: 'https://plans-offers.watcho.com/',
          'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        httpsAgent // Using proxy,
        // proxy: oxyProxy
      }
    );

    console.log("OTP Verification API response:", response.data);

    const { result, resultStatus } = response.data;
    
    if (!result) {
      return res.status(400).json({ message: 'OTP verification failed', resultStatus: 'FAILED' });
    }

    const savedSubscription = await new Subscription({
      mobile: result.MobileNo,
      ottsmsid: result.OTTSMSID,
      authcode: result.AuthToken,
      createdate: new Date(),
      updatedate: new Date(),
      status: resultStatus,
    }).save();

    console.log("Subscription saved:", savedSubscription);

    res.status(200).json({
      message: 'OTP verification successful',
      resultStatus: 'SUCCESS',
      data: {
        mobileNo: result.MobileNo,
        authToken: result.AuthToken,
        otpSent: true,
      },
    });
  } catch (error) {
    console.error("Error calling OTP verification API via proxy:", error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data || { message: 'Internal server error', error: error.message };
    res.status(status).json(message);
  }
});


router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Find the user by email
    const user = await User.findOne({ email: email });

    if (!user) {
      return res.status(401).json({ message: "User not found. Please check your email." });
    }

    // Check if the password matches
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Password is Incorrect" });
    }

    // Generate JWT token
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET);

    // Check if the user is a 'Member' and requires OTP verification
    if (user.role === 'Member') {
      // Check if the user's mobile number exists in the Subscription table
      const subscription = await Subscription.findOne({ mobile: user.mobile });

      if (!subscription) {
        console.log("Required sub");
        // If the mobile is not in Subscription, request OTP verification
        return res.status(200).json({
          requireOTP: true,
          email: user.email,
          token,  // Send token in the response
          message: "Mobile number verification required. Please enter your mobile number to receive OTP."
        });
      }
    }

    // Send success response with token
    res.status(200).json({
      token,
      username: user.name,
      msg: "User login successfully"
    });

  } catch (err) {
    res.status(500).json({ message: "Internal Server Error", error: err.message });
  }
});




router.post('/logout',authenticateToken, (req, res) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
      return res.status(400).send('Authorization header missing');
    }
  
    const token = req.headers.authorization.split(' ')[1];
    
    tokenBlacklist.add(token);
    
    
    res.status(200).send('Logged out successfully');
  });
module.exports = router;
