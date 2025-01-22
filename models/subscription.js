const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  mobile: { type: String ,required: true,},
  ottsmsid: { type: String ,required: true,},
  authcode: { type: String ,required: true,},
  createdate: { type: Date,  default: Date.now },
  updatedate: { type: Date,  default: Date.now },
  status: { type: String },
  offerName: { type: String, default: 'Watcho' },
  offerCode: { type: String, default: 'WTCH' }
});

module.exports = mongoose.model('Subscription', subscriptionSchema);