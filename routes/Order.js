const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Team = require('../models/Team');
const User = require('../models/User');
const authenticateToken = require('../middleware/authenticateToken');

// API to allocate orders (for both Admin and TeamLeader)
router.post('/allocate-orders', authenticateToken, async (req, res) => {
    try {
        const { teamId, memberId, count, orderType } = req.body;
        const userId = req.user.id;
        const role = req.user.role;

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to start of day

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // **Admin Allocating Orders to Teams**
        if (role === 'Admin') {
            if (!teamId) {
                return res.status(400).json({ message: "Team ID is required for admin allocation" });
            }

            const team = await Team.findOne({ teamId });
            if (!team) {
                return res.status(404).json({ message: "Team not found" });
            }

            // Fetch unallocated orders of today's date & matching orderType
            const orders = await Order.find({
                createdAt: { $gte: today }, // Only today's imports
                team: null, // Not already allocated
                orderType: orderType // Filter by order type
            }).limit(count);

            if (orders.length === 0) {
                return res.status(400).json({ message: "No unallocated orders available for today" });
            }

            // Allocate orders
            const allocateDate = new Date();
            const orderIds = orders.map(order => order.orderId);
            await Order.updateMany(
                { orderId: { $in: orderIds } },
                {
                    $set: {
                        team: {
                            teamId: team.teamId,
                            teamName: team.teamName,
                            allocateDate: allocateDate,
                        },
                        status: "Allocated"
                    }
                }
            );

            return res.status(200).json({ message: "Orders allocated to team", ordersAllocated: orderIds });
        }

        // **TeamLeader Allocating Orders to Members**
        if (role === 'TeamLeader') {
            if (!memberId) {
                return res.status(400).json({ message: "Member ID is required for team leader allocation" });
            }

            const team = await Team.findOne({ teamLeader: userId });
            if (!team) {
                return res.status(403).json({ message: "Unauthorized: You are not a team leader" });
            }

            const member = team.membersList.find(m => m.userId.toString() === memberId);
            if (!member) {
                return res.status(400).json({ message: "Member not found in this team" });
            }

            // Fetch unassigned orders that were allocated to this team today
            const orders = await Order.find({
                createdAt: { $gte: today }, // Only today's imports
                "team.teamId": team.teamId, // Belongs to the same team
                member: null // Not already assigned
            }).limit(count);

            if (orders.length === 0) {
                return res.status(400).json({ message: "No unassigned orders available for today" });
            }

            // Allocate orders to the member
            const allocateDate = new Date();
            const orderIds = orders.map(order => order.orderId);
            await Order.updateMany(
                { orderId: { $in: orderIds } },
                {
                    $set: {
                        member: {
                            memberId: member.userId,
                            memberName: member.name,
                            allocateDate: allocateDate,
                        },
                        status: "Assign"
                    }
                }
            );

            return res.status(200).json({ message: "Orders assigned to member", ordersAssigned: orderIds });
        }

        return res.status(403).json({ message: "Unauthorized role" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
});

module.exports = router;
