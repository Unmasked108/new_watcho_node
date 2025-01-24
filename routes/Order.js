const express = require('express');
const Order = require('../models/order');
const { authenticateToken } = require('./Jwt'); // Assuming this is for authentication
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/user');
const Team = require('../models/team');





router.post("/allocate-orders", authenticateToken, async (req, res) => {
    try {
      const { id, role } = req.user; // Extract user ID & role from JWT
      const ordersData = req.body.orders; // Expecting an array of orders
  
      console.log(`User Role: ${role}, User ID: ${id}`);
      console.log("Received Order Data:", JSON.stringify(ordersData, null, 2));
  
      if (!ordersData || !Array.isArray(ordersData)) {
        return res.status(400).json({ error: "Invalid orders data format." });
      }
  
      if (role === "Admin") {
        await allocateOrdersAsAdmin(ordersData);
        return res.json({ success: true, message: "Orders allocated to teams." });
      } else if (role === "TeamLeader") {
        await allocateOrdersAsTeamLeader(ordersData);
        return res.json({ success: true, message: "Orders assigned to members." });
      } else {
        return res.status(403).json({ error: "Unauthorized role." });
      }
    } catch (error) {
      console.error("Error in allocation:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  });
  
  /**
   * Admin Order Allocation - Assigns orders to teams
   */
  async function allocateOrdersAsAdmin(ordersData) {
    for (const order of ordersData) {
      const { date, teamId, orderType, ordersCount } = order;
      
      // 🚨 Skip teams where ordersCount is 0
      if (!date || !teamId || !orderType || ordersCount <= 0) {
        console.warn(`Skipping order for Team ${teamId}: Missing required fields or ordersCount is 0`);
        continue;
      }
      const team = await Team.findOne({ teamId });
      if (!team) {
        console.warn(`No team found for TeamID: ${teamId}`);
        continue;
      }
      const teamName = team.teamName;
      console.log(`Processing Admin Order: TeamID=${teamId}, Date=${date}, Count=${ordersCount}`);
  
      // Find unallocated orders for the given date & order type
      const availableOrders = await Order.find({
        "team.teamId": { $exists: false }, // Orders that are not yet allocated
        orderType,
        status: "New",
        createdAt: { $gte: new Date(date) },
      }).limit(ordersCount);
  
      if (availableOrders.length === 0) {
        console.log(`No available orders for Date: ${date}, OrderType: ${orderType}`);
        continue;
      }
  
      // Update found orders with team allocation
      const orderIds = availableOrders.map((o) => o._id);
      await Order.updateMany(
        { _id: { $in: orderIds } },
        {
          $set: {
            "team.teamId": teamId,
            "team.teamName":teamName, // Assuming teamName is unique
            "team.allocateDate": date(),
            status: "Allocated",
          },
        }
      );
  
      console.log(`Allocated ${availableOrders.length} orders to Team ${teamId}`);
    }
  }
  
  
  /**
   * Team Leader Order Allocation - Assigns orders to members
   */
  async function allocateOrdersAsTeamLeader(ordersData) {
    for (const order of ordersData) {
      const { date, teamId, memberId, orderType, ordersCount } = order;
  
      console.log(`Processing TeamLeader Order: TeamID=${teamId}, MemberID=${memberId}, Date=${date}, Count=${ordersCount}`);
  
      if (!date || !teamId || !memberId || !orderType) {
        console.warn("Skipping order: Missing required fields");
        continue;
      }
      const member = await User.findById(memberId);
      if (!member) {
        console.warn(`No member found for MemberID: ${memberId}`);
        continue;
      }
      const memberName = member.name;
      // Find allocated orders without a member assigned
      const availableOrders = await Order.find({
        "team.teamId": teamId, // Orders already allocated to this team
        "member.memberId": { $exists: false }, // Orders that are not yet assigned
        orderType,
        status: "Allocated",
        createdAt: { $gte: new Date(date) },
      }).limit(ordersCount);
  
      if (availableOrders.length === 0) {
        console.log(`No available orders for Team ${teamId} on Date: ${date}`);
        continue;
      }
  
      // Update orders with member allocation
      const orderIds = availableOrders.map((o) => o._id);
      await Order.updateMany(
        { _id: { $in: orderIds } },
        {
          $set: {
            "member.memberId": memberId,
            "member.memberName": memberName, // Assuming memberName is unique
            "member.allocateDate": new Date(),
            status: "Assign",
          },
        }
      );
  
      console.log(`Assigned ${availableOrders.length} orders to Member ${memberId} in Team ${teamId}`);
    }
  }
  


// Route to create a new order
router.post('/orders', authenticateToken, async (req, res) => {
    try {
      console.log('Received Data:', req.body); // Log the data sent by the frontend
  
      const orders = Array.isArray(req.body) ? req.body : [req.body];
  
      // Check for size limit
      if (orders.length > 5000) {
        return res.status(413).json({ message: 'Payload too large. Maximum 5000 records allowed.' });
      }
  
      // Ensure all orders include the "state" field with default value "new"
      const ordersWithState = orders.map(order => ({
        ...order,
        coupon: order.coupon === null ? 'not given' : order.coupon, // Replace null with 'not given'
        status:  'New', // Add "state" only if it's not already provided
        orderType: order.coupon && order.coupon !== 'not given' ? 149 : 299, // Determine orderType based on coupon
      }));
  
      // Save orders
      const savedOrders = await Order.insertMany(ordersWithState);
      res.status(201).json({ message: 'Orders created successfully', orders: savedOrders });
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(400).json({ message: 'Validation error', errors: error.errors });
      }
      if (error.code === 11000) { // Duplicate key error
        return res.status(400).json({ message: 'Order ID must be unique' });
      }
      console.error(error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  

  router.post("/unallocate-orders", authenticateToken, async (req, res) => {
    try {
      const { id, role } = req.user; // Extract user ID & role from JWT
      const ordersData = req.body.orders; // Expecting an array of orders
  
      console.log(`User Role: ${role}, User ID: ${id}`);
      console.log("Received Unallocation Data:", JSON.stringify(ordersData, null, 2));
  
      if (!ordersData || !Array.isArray(ordersData)) {
        return res.status(400).json({ error: "Invalid orders data format." });
      }
  
      if (role === "Admin") {
        await unallocateOrdersAsAdmin(ordersData);
        return res.json({ success: true, message: "Orders unallocated from teams." });
      } else if (role === "TeamLeader") {
        await unallocateOrdersAsTeamLeader(ordersData);
        return res.json({ success: true, message: "Orders unallocated from members." });
      } else {
        return res.status(403).json({ error: "Unauthorized role." });
      }
    } catch (error) {
      console.error("Error in unallocation:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  });
  
  /**
   * Admin Unallocation - Removes orders from a specific team
   */
  async function unallocateOrdersAsAdmin(ordersData) {
    for (const order of ordersData) {
      const { date, teamId, orderType, ordersCount } = order;
  
      console.log(`Processing Admin Unallocation: TeamID=${teamId}, Date=${date}, OrderType=${orderType}, Count=${ordersCount}`);
  
      if (!date || !teamId || !orderType) {
        console.warn("Skipping order: Missing required fields");
        continue;
      }
  
      // Find orders allocated to this team but NOT Completed or Verified
      let query = {
        "team.teamId": teamId,
        status: { $nin: ["Completed", "Verified"] },
        orderType,
        createdAt: { $gte: new Date(date) },
      };
  
      let ordersToUnallocate = ordersCount
        ? await Order.find(query).limit(ordersCount)
        : await Order.find(query); // Unallocate all if count is not provided
  
      if (ordersToUnallocate.length === 0) {
        console.log(`No orders found for unallocation in Team ${teamId} on Date: ${date}`);
        continue;
      }
  
      const orderIds = ordersToUnallocate.map((o) => o._id);
      await Order.updateMany(
        { _id: { $in: orderIds } },
        {
          $unset: { team: 1, member: 1 }, // Remove team & member details
          $set: { status: "New" }, // Change status back to New
        }
      );
  
      console.log(`Unallocated ${ordersToUnallocate.length} orders from Team ${teamId}.`);
    }
  }
  
  /**
   * Team Leader Unallocation - Removes orders from members
   */
  async function unallocateOrdersAsTeamLeader(ordersData) {
    for (const order of ordersData) {
      const { date, teamId, orderType, ordersCount } = order;
  
      console.log(`Processing TeamLeader Unallocation: TeamID=${teamId}, Date=${date}, OrderType=${orderType}, Count=${ordersCount}`);
  
      if (!date || !teamId || !orderType) {
        console.warn("Skipping order: Missing required fields");
        continue;
      }
  
      // Find orders assigned to members but NOT Completed or Verified
      let query = {
        "team.teamId": teamId,
        "member.memberId": { $exists: true },
        status: { $nin: ["Completed", "Verified"] },
        orderType,
        createdAt: { $gte: new Date(date) },
      };
  
      let ordersToUnallocate = ordersCount
        ? await Order.find(query).limit(ordersCount)
        : await Order.find(query); // Unallocate all if count is not provided
  
      if (ordersToUnallocate.length === 0) {
        console.log(`No orders found for unallocation in Team ${teamId} on Date: ${date}`);
        continue;
      }
  
      const orderIds = ordersToUnallocate.map((o) => o._id);
      await Order.updateMany(
        { _id: { $in: orderIds } },
        {
          $unset: { member: 1 }, // Remove member details only
          $set: { status: "Allocated" }, // Change status back to Allocated
        }
      );
  
      console.log(`Unallocated ${ordersToUnallocate.length} orders from members in Team ${teamId}.`);
    }
  }


  router.get('/orders', authenticateToken, async (req, res) => {
    try {
      const { date, paidStatus, teamName, orderType,teamId } = req.query;
      console.log('details from frontend:', req.query);
      console.log('User role:', req.user.role);
  
      let filter = {};
  
      // Role-Based Filtering (Admin and TeamLeader only)
      if (req.user.role === 'Admin') {
        if (date) {
          const startOfDay = new Date(date);
          const endOfDay = new Date(date);
          endOfDay.setHours(23, 59, 59, 999);
          filter['team.allocateDate'] = { $gte: startOfDay, $lte: endOfDay };
        }
        if (teamName) {
          filter['team.teamName'] = teamName;
        }
      } else if (req.user.role === 'TeamLeader') {
        filter['team.teamId'] = teamId;
        if (date) {
          const startOfDay = new Date(date);
          const endOfDay = new Date(date);
          endOfDay.setHours(23, 59, 59, 999);
          filter['team.allocateDate'] = { $gte: startOfDay, $lte: endOfDay };
        }
      }
  
      // Additional filters
      if (paidStatus) {
        // Map `paidStatus` to corresponding statuses
        if (paidStatus === 'Paid') {
          filter['status'] = { $in: ['Completed', 'Verified'] }; // Paid -> Completed, Verified
        } else if (paidStatus === 'Unpaid') {
          filter['status'] = { $in: ['Allocated', 'Assign'] }; // Unpaid -> Allocated, Assign
        }
      } else {
        // Default to all relevant statuses if `paidStatus` is not provided
        filter['status'] = { $in: ['Allocated', 'Assign', 'Completed', 'Verified'] };
      }
      if (orderType) {
        filter['orderType'] = orderType;
      }
  
      // Fetching orders
      const orders = await Order.find(filter).select(
        'orderId status coupon link orderType team profit'
      );
  
      console.log('Raw orders fetched:', orders);
  
      // Transform data
      const transformedOrders = orders.map((order) => ({
        orderId: order.orderId,
        status: order.status,
        coupon: order.coupon,
        link: order.link,
        orderType: order.orderType,
        teamId: order.team?.teamId || null,
        teamName: order.team?.teamName || null,
        teamCompletionDate: order.team?.completionDate || null,
        profitBehindOrder: order.profit?.profitBehindOrder || null,
        membersProfit: order.profit?.membersProfit || null,
      }));
  
      console.log('Transformed orders:', transformedOrders);
  
      // Return the transformed orders
      res.status(200).json(transformedOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });
  router.get('/orders/count', authenticateToken, async (req, res) => {
    try {
      const { date, teamName } = req.query; // Date in YYYY-MM-DD format and optional teamName
  
      if (!date) {
        return res.status(400).json({ message: 'Date is required' });
      }
  
      // Convert the date to the start and end of the day
      const startOfDay = new Date(date);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999); // Set to the end of the day
  
      // Initialize the base query
      let query = {
        createdAt: { $gte: startOfDay, $lte: endOfDay },
      };
  
      // Add the teamName filter if provided
      if (teamName) {
        query['team.teamName'] = teamName;
      }
  
      // Query for total orders
      const totalOrders = await Order.countDocuments(query);
  
      // Query for total allocated orders
      const totalAllocatedLeads = await Order.countDocuments({
        ...query,
        status: { $in: ['Allocated', 'Assign'] }, 
      });
  
      // Send response
      res.status(200).json({
        totalOrders,
        totalAllocatedLeads,
      });
    } catch (error) {
      console.error('Error fetching orders count:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });
  
  
  module.exports = router;