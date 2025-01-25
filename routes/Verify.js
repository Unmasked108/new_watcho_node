const Results = require('../models/Results');
const Order=require("../models/Order")



async function processVerifyLogic(results) {
    const https = require('https');
    const axios = require('axios');
    const { HttpsProxyAgent } = require('https-proxy-agent');
  
    // Proxy configuration
    const proxyHost = 'brd.superproxy.io';
    const proxyPort = '33335';
    const proxyUsername = 'brd-customer-hl_0083dc41-zone-recrd_residential-country-in';
    const proxyPassword = 'ks2flzwvbw7g';
    const proxyUrl = `http://${proxyUsername}:${proxyPassword}@${proxyHost}:${proxyPort}`;
    const httpsAgent = new HttpsProxyAgent(proxyUrl);
  
    for (const result of results) {
      if (result.orderLink) {
        console.log(`Checking payment for: ${result.orderLink}`);
  
        let success = false;
  
        try {
          const response = await axios.get(result.orderLink, {
            httpsAgent: httpsAgent,
            maxRedirects: 0,
            validateStatus: (status) => status < 400 || status === 302, // Allow redirects and 302 responses
          });
  
          const isPaymentDone = response.status === 302;
          console.log(`Payment for ${result.resultId}: ${isPaymentDone ? 'Done' : 'Not Done'}`);
          result.Completion = isPaymentDone ? 'Done' : 'Not Done';
          success = true;
        } catch (err) {
          console.error(`Error processing payment for ${result.resultId} on first attempt: ${err.message}`);
        }
  
        // Retry logic
        if (!success) {
          let attempts = 1;
          while (attempts < 3) {
            try {
              console.log(`Retrying payment for ${result.resultId}, attempt ${attempts + 1}`);
              const response = await axios.get(result.orderLink, {
                httpsAgent: httpsAgent,
                maxRedirects: 0,
                validateStatus: (status) => status < 400 || status === 302,
              });
  
              const isPaymentDone = response.status === 302;
              console.log(`Payment for ${result.resultId}: ${isPaymentDone ? 'Done' : 'Not Done'}`);
              result.Completion = isPaymentDone ? 'Done' : 'Not Done';
              success = true;
              break;
            } catch (err) {
              attempts++;
              console.error(`Error processing payment for ${result.resultId} on retry ${attempts}: ${err.message}`);
              if (attempts >= 3) {
                result.Completion = 'Error';
                console.log(`Payment for ${result.resultId} marked as Error after 3 attempts.`);
              }
            }
          }
        }

      
      
      // Determine completionStatus
      if (success) {
        if (result.paymentStatus === 'Paid' && result.Completion === 'Done') {
            result.completionStatus = 'Verified Done';
        } else if (result.paymentStatus === 'Paid' && result.Completion === 'Not Done') {
            result.completionStatus = 'Verified Not Done';
            try {
               // Fetch ObjectId of the order from the Order schema
               const order = await Order.findOne({ orderId: result.orderId });
               if (!order) {
                   console.error(`Order with ID ${result.orderId} not found.`);
                   continue;
               }

               // Update order payment status to 'Unpaid'
               await Order.findOneAndUpdate(
                   { orderId: result.orderId },
                   { paymentStatus: 'Unpaid', updatedAt: new Date() }
               );
               console.log(`Order ${result.orderId} payment status reverted to Unpaid.`);

               // Revert profits to 0 in Results using the ObjectId of the order
               await Results.findOneAndUpdate(
                   { orderId: order._id },
                   {
                    paymentStatus: 'Unpaid',
                    profitBehindOrder: 0,
                    membersProfit: 0
                }
               );
               console.log(`Reverted profitBehindOrder and membersProfit to 0 for result with order ID: ${order._id}`);
               
                       // Update the result object to reflect the changes
                       result.paymentStatus = 'Unpaid';
                       result.profitBehindOrder = 0;
                       result.membersProfit = 0;
          
              } catch (updateError) {
              console.error(`Failed to update order status for ${result.orderId}:, updateError.message`);
          }
        } else if(result.paymentStatus === 'Unpaid' && result.Completion === 'Done'){ 
            result.completionStatus = 'Unattempted';
        }
    } else {
        result.completionStatus = 'Error';
    }
} else {
    console.log(`No payment link found for result ID: ${result.resultId}`);
    result.Completion = 'No Link';
    result.completionStatus = 'Error'; // No link to verify
}
}

return results;
}

  module.exports = { processVerifyLogic };
