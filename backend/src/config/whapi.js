const axios = require('axios');

const WHAPI_BASE_URL = process.env.WHAPI_BASE_URL || 'https://gate.whapi.cloud';
const WHAPI_TOKEN = process.env.WHAPI_TOKEN;

const whapiClient = axios.create({
  baseURL: WHAPI_BASE_URL,
  headers: {
    'Authorization': `Bearer ${WHAPI_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

// Helper functions
const whapi = {
  // שליחת הודעת טקסט
  async sendMessage(to, text) {
    try {
      const response = await whapiClient.post('/messages/text', {
        to,
        body: text
      });
      return response.data;
    } catch (error) {
      console.error('Error sending WhatsApp message:', error.response?.data || error.message);
      throw error;
    }
  },

  // שליחת הודעה עם תמונה
  async sendImage(to, imageUrl, caption) {
    try {
      const response = await whapiClient.post('/messages/image', {
        to,
        media: imageUrl,
        caption
      });
      return response.data;
    } catch (error) {
      console.error('Error sending WhatsApp image:', error.response?.data || error.message);
      throw error;
    }
  },

  // שליחת הודעה עם כפתורים
  async sendButtons(to, text, buttons) {
    try {
      const response = await whapiClient.post('/messages/interactive', {
        to,
        type: 'button',
        body: {
          text
        },
        action: {
          buttons: buttons.map((btn, index) => ({
            type: 'reply',
            reply: {
              id: btn.id || `btn_${index}`,
              title: btn.title
            }
          }))
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error sending WhatsApp buttons:', error.response?.data || error.message);
      throw error;
    }
  },

  // שליחת הודעה לקבוצה
  async sendToGroup(groupId, text) {
    return this.sendMessage(groupId, text);
  },

  // שליחת הודעה לקבוצה עם תמונה
  async sendImageToGroup(groupId, imageUrl, caption) {
    return this.sendImage(groupId, imageUrl, caption);
  }
};

module.exports = whapi;
