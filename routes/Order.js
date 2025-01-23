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
            "team.allocateDate": new Date(),
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
  
  module.exports = router;