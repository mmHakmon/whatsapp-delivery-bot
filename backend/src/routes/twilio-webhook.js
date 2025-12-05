// twilio-webhook.js - Handle incoming WhatsApp messages from Twilio
const express = require('express');
const TwilioService = require('../services/TwilioService');
const logger = require('../utils/logger');

const router = express.Router();

// Twilio sends POST requests to this endpoint
router.post('/', async (req, res) => {
  try {
    const {
      From,           // whatsapp:+972501234567
      Body,           // Message text
      MessageSid,     // Unique message ID
      NumMedia,       // Number of media files
      ProfileName     // Sender's WhatsApp profile name
    } = req.body;

    logger.info(`Incoming WhatsApp message from ${From}: ${Body}`);

    // Process the message
    await TwilioService.handleIncomingMessage(From, Body, MessageSid);

    // Twilio expects a TwiML response (can be empty)
    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');
    
  } catch (error) {
    logger.error('Error processing Twilio webhook:', error.message);
    res.status(500).send('<Response></Response>');
  }
});

// Verification endpoint (GET) - Twilio doesn't need this but good to have
router.get('/', (req, res) => {
  res.send('Twilio WhatsApp Webhook is active');
});

module.exports = router;
