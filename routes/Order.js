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
      const { 
        date, 
        teamId, 
        memberId, 
        memberName,  // Add this
        orderType, 
        ordersCount 
      } = order;
  
      console.log(`Processing TeamLeader Order: 
        TeamID=${teamId}, 
        MemberID=${memberId}, 
        MemberName=${memberName},  // Log memberName
        Date=${date}, 
        Count=${ordersCount}`);
  
      if (!date || !teamId || !memberId || !memberName || !orderType) {
        console.warn("Skipping order: Missing required fields");
        continue;
      }

      
  
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0); // Set to 00:00:00 of that day
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999); // Set to 23:59:59 of that day
      
      const availableOrders = await Order.find({
        "team.teamId": teamId,
        "member.memberId": { $exists: false },
        orderType,
        status: "Allocated",
        createdAt: { $gte: startOfDay, $lte: endOfDay },
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
            "member.memberName": memberName,  // Add memberName
            "member.allocateDate": new Date(),
            status: "Assign",
          },
        }
      );
  
      console.log(`Assigned ${availableOrders.length} orders to Member ${memberId} (${memberName}) in Team ${teamId}`);
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
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0); // Set to 00:00:00 of that day
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999); // Set to 23:59:59 of that day
  
      // Find orders assigned to members but NOT Completed or Verified
      let query = {
        "team.teamId": teamId,
        "member.memberId": { $exists: true },
        status: { $nin: ["Completed", "Verified"] },
        orderType,
        createdAt: { $gte: startOfDay, $lte: endOfDay },
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
  };


  /**
   * GET API for fetching order details based on user role.
   */
  /**
 * GET API for fetching order details based on user role.
 */
  router.get("/fetch-orders", authenticateToken, async (req, res) => {
    try {
      const { id, role } = req.user; // Extract user ID & role from JWT
      const { date, endDate, teamId, teamIds, memberId, memberName, orderType } = req.query;
  
      console.log(`Received request: UserRole=${role}, UserId=${id}`);
      console.log(`Request Query Parameters:`, req.query);
  
      if (!date || !orderType) {
        console.log("Error: Date and orderType are required.");
        return res.status(400).json({ error: "Date and orderType are required." });
      }
  
      const startDate = new Date(date); // Start of the day
      const end = endDate ? new Date(endDate) : new Date(date); // End of the day or specified endDate
  
      // Adjust times to cover the full day
      startDate.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
  
      let query = {
        orderType: Number(orderType),
        createdAt: { $gte: startDate, $lte: end },
      };
  
      console.log("Base query object:", query);
  
      if (role === "Admin") {
        if (!teamIds || !Array.isArray(JSON.parse(teamIds))) {
          console.log("Error: Invalid or missing teamIds.");
          return res.status(400).json({ error: "Invalid or missing teamIds." });
        }
        const totalOrders = await Order.countDocuments({
          createdAt: { $gte: startDate, $lte: end },
        });
        console.log("Total Orders for the day:", totalOrders);


        const parsedTeamIds = JSON.parse(teamIds);
  
        query["team.teamId"] = { $in: parsedTeamIds };
  
        console.log("Admin Query after adding teamIds filter:", query);
  

// Construct the query for orderType149Count and orderType299Count
// Construct the query for orderType149Count and orderType299Count
const orderType149Count = await Order.countDocuments({
  createdAt: { $gte: startDate, $lte: end }, // Adjusted to match date range
  orderType: 149, // Filter for orderType 149
});

const orderType299Count = await Order.countDocuments({
  createdAt: { $gte: startDate, $lte: end }, // Adjusted to match date range
  orderType: 299, // Filter for orderType 299
});


console.log("Order Type 149 Count:", orderType149Count);
console.log("Order Type 299 Count:", orderType299Count);

        // Get allocated count and completion count per team
        const teamCounts = await Promise.all(
          parsedTeamIds.map(async (teamId) => {
            const allocatedCount = await Order.countDocuments({
              ...query,
              "team.teamId": teamId,
              status: { $in: ["Allocated", "Assign", "Completed", "Verified"] },
            });
            const completionCount = await Order.countDocuments({
              ...query,
              "team.teamId": teamId,
              status: { $in: ["Completed", "Verified"] },
            });
            return { teamId, allocatedCount, completionCount };
          })
        );
  
        // Calculate totals for all teams
        const totalAllocatedCount = teamCounts.reduce((sum, team) => sum + team.allocatedCount, 0);
        const totalCompletedCount = teamCounts.reduce((sum, team) => sum + team.completionCount, 0);
  
        // Get total orders for the day
  
        const response = {
          success: true,
          role,
          teamCounts, // Return counts per team
          totalAllocatedCount, // Total allocated count for all teams
          totalCompletedCount, // Total completed count for all teams
          totalOrders, // Total orders for the day
          orderType149Count, // Count for orderType 149
          orderType299Count, // Count for orderType 299
        };
  
        console.log("Response for Admin:", response);
        return res.json(response);
      } else if (role === "TeamLeader") {
        if (!teamId) {
          return res.status(400).json({ error: "TeamId is required." });
        }
  
        query["team.teamId"] = teamId;
  
        // Get allocated count and completion count for the team
        const teamAllocatedCount = await Order.countDocuments({ ...query, status: "Allocated" });
  
        // Fetch members in the team
        const membersWithCounts = await Order.aggregate([
          {
            $match: {
              ...query,
              "team.teamId": teamId,
              "member.memberId": { $exists: true },
            },
          },
          {
            $group: {
              _id: "$member.memberId",
              memberName: { $first: "$member.memberName" },
              assignedCount: {
                $sum: { $cond: [{ $eq: ["$status", "Assign"] }, 1, 0] },
              },
              completedCount: {
                $sum: { $cond: [{ $in: ["$status", ["Completed", "Verified"]] }, 1, 0] },
              },
            },
          },
        ]);
  
        const teamCompletionCount = await Order.countDocuments({
          ...query,
          status: { $in: ["Completed", "Verified"] },
        });
  
        // Get total orders for the day
        const totalOrders = await Order.countDocuments(query);
  
        const response = {
          success: true,
          role,
          teamAllocatedCount,
          teamCompletionCount,
          memberCounts: membersWithCounts,
          totalOrders, // Total orders for the day
        };
  
        return res.json(response);
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  });
  

// Fetch allocated leads
router.get('/allocated-leads', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id; // Extract user ID from token
    const { date } = req.query; // Extract date from query params

    console.log('Received userId:', userId);
    console.log('Received date:', date);

    if (!userId) {
      return res.status(400).json({ error: 'User ID not found' });
    }

    // Build query for fetching orders
    const query = { "member.memberId": userId };
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query["member.allocateDate"] = { $gte: startOfDay, $lte: endOfDay };
    }

    // Fetch orders
    const orders = await Order.find(query, 'orderId link status');
    console.log('Fetched orders:', orders);

    // Count allocated leads
    const allocatedLeadCounts = orders.length;

    // Count completed orders (status is 'Completed' or 'Verified')
    const completedCount = orders.filter(
      (order) => order.status === 'Completed' || order.status === 'Verified'
    ).length;

    console.log('Allocated lead count:', allocatedLeadCounts);
    console.log('Completed count:', completedCount);

    return res.json({ allocatedLeadCounts, completedCount, orders });
  } catch (error) {
    console.error('Error fetching allocated leads:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});
// Update payment status and order status
// Update order status
router.patch('/update-order-status', authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.body;

    console.log('Received orderId for update:', orderId);

    if (!orderId) {
      return res.status(400).json({ message: 'Order ID is required' });
    }

    const order = await Order.findOne({ orderId });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    console.log('Fetched order:', order);

    // If the status is already 'Completed', return early
    if (order.status === 'Completed') {
      console.log('Order already marked as Completed:', order);
      return res.status(400).json({ message: 'Order status already updated to Completed' });
    }

      // Update status from 'Assign' to 'Completed'
    if (order.status === 'Assign') {
      order.status = 'Completed';
      console.log('Order status updated to Completed:', order);

      // Update the profit field
      order.profit = {
        commission: 10,
        profitBehindOrder: order.orderType === 149 ? 71 : order.orderType === 299 ? 61 : 0,
        membersProfit: 10,
      };
      console.log('Profit field updated:', order.profit);
    }

    await order.save();
    console.log('Updated order:', order);

    // Recalculate the allocated lead counts and completed count after status update
    const userId = req.user.id; // Extract user ID from token
    console.log('Extracted userId:', userId);

    if (!userId) {
      return res.status(400).json({ message: 'User ID not found' });
    }

    const orders = await Order.find({ "member.memberId": userId });
    console.log('Orders fetched for userId:', userId);
    console.log('Orders:', orders);

    const allocatedLeadCounts = orders.length;
    const completedCount = orders.filter(
      (order) => order.status === 'Completed' || order.status === 'Verified'
    ).length;

    console.log('Recalculated allocated lead count:', allocatedLeadCounts);
    console.log('Recalculated completed count:', completedCount);

    res.status(200).json({
      message: 'Order status updated successfully',
      order,
      allocatedLeadCounts,
      completedCount,
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Revert order status
router.patch('/revert-order-status', authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.body;

    console.log('Received orderId for revert:', orderId);

    if (!orderId) {
      return res.status(400).json({ message: 'Order ID is required' });
    }

    const order = await Order.findOne({ orderId });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    console.log('Fetched order for revert:', order);

   // Revert status from 'Completed' to 'Assign'
   if (order.status === 'Completed') {
    order.status = 'Assign';
    console.log('Order status reverted to Assign:', order);

    // Clear the profit field
    order.profit = {
      commission: null,
      profitBehindOrder: null,
      membersProfit: null,
    };
    console.log('Profit field cleared:', order.profit);
  }
    await order.save();
    console.log('Reverted order:', order);

    // Recalculate the allocated lead counts and completed count after status revert
    const userId = req.user.id; // Extract user ID from token
    console.log('Extracted userId:', userId);

    if (!userId) {
      return res.status(400).json({ message: 'User ID not found' });
    }

    const orders = await Order.find({ "member.memberId": userId });
    console.log('Orders fetched for userId:', userId);
    console.log('Orders:', orders);

    const allocatedLeadCounts = orders.length;
    const completedCount = orders.filter(
      (order) => order.status === 'Completed' || order.status === 'Verified'
    ).length;

    console.log('Recalculated allocated lead count:', allocatedLeadCounts);
    console.log('Recalculated completed count:', completedCount);

    res.status(200).json({
      message: 'Order status reverted successfully',
      order,
      allocatedLeadCounts,
      completedCount,
    });
  } catch (error) {
    console.error('Error reverting order status:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});


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
      'orderId status coupon link orderType team profit member'
    );

    console.log('Raw orders fetched:', orders);

    // Transform data
    const transformedOrders = orders.map((order) => ({
      orderId: order.orderId,
      paymentStatus: ["Completed", "Verified"].includes(order.status) ? "Paid" : "Unpaid",
      coupon: order.coupon,
      link: order.link,
      orderType: order.orderType,
      teamId: order.team?.teamId || null,
      teamName: order.team?.teamName || null,
      memberName: order.member?.memberName || null,
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
