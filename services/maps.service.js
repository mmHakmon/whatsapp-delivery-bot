const axios = require('axios');

class MapsService {
  constructor() {
    this.apiKey = process.env.GOOGLE_API_KEY;
  }

  // Calculate distance between two addresses
  async calculateDistance(origin, destination) {
    try {
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json`;
      const params = {
        origins: origin,
        destinations: destination,
        key: this.apiKey,
        language: 'iw'
      };

      const response = await axios.get(url, { params });
      
      if (response.data.rows[0].elements[0].status === 'OK') {
        const distanceMeters = response.data.rows[0].elements[0].distance.value;
        const distanceKm = distanceMeters / 1000;
        return parseFloat(distanceKm.toFixed(2));
      }
      
      throw new Error('Cannot calculate distance');
    } catch (error) {
      console.error('Distance calculation error:', error);
      throw error;
    }
  }

  // Geocode address to coordinates
  async geocodeAddress(address) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json`;
      const params = {
        address,
        key: this.apiKey,
        language: 'iw'
      };

      const response = await axios.get(url, { params });
      
      if (response.data.results.length > 0) {
        const location = response.data.results[0].geometry.location;
        return {
          lat: location.lat,
          lng: location.lng
        };
      }
      
      throw new Error('Address not found');
    } catch (error) {
      console.error('Geocoding error:', error);
      throw error;
    }
  }

  // Reverse geocode coordinates to address
  async reverseGeocode(lat, lng) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json`;
      const params = {
        latlng: `${lat},${lng}`,
        key: this.apiKey,
        language: 'iw'
      };

      const response = await axios.get(url, { params });
      
      if (response.data.results.length > 0) {
        return response.data.results[0].formatted_address;
      }
      
      throw new Error('Address not found');
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      throw error;
    }
  }
}

module.exports = new MapsService();