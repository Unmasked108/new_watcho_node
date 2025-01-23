const mongoose = require('mongoose');

// Define the Order schema
const OrderSchema = new mongoose.Schema(
  {
    customerId: { type: String }, // Optional
    source: { type: String }, // Optional
    coupon: { type: String, default: 'not given' }, // Optional with default
    status: { 
      type: String, 
      enum: ['New', 'Allocated', 'Assign', 'Completed', 'Verified'], 
      default: 'New' 
    },
    orderId: { type: String, unique: true }, // Still unique but optional
    link: { type: String }, // Optional

    orderType: { type: Number }, // New field for order type

    // Modified team field with detailed information
    team: { 
      teamId: { type: String },
      teamName: { type: String },
      allocateDate: { type: Date },
      completionDate: { type: Date }
    },

    // Modified member field with detailed information
    member: { 
      memberId: { type: String },
      memberName: { type: String },
      allocateDate: { type: Date },
      completionDate: { type: Date }
    },

    // New 'profit' field with commission, profitBehindOrder, and membersProfit
    profit: {
      commission: { type: Number },
      profitBehindOrder: { type: Number },
      membersProfit: { type: Number }
    }
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
  }
);


module.exports = mongoose.model('Order', OrderSchema);
