const axios = require('axios');

class MapsService {
  constructor() {
    this.apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  }

  // ==========================================
  // ✅ NEW: Calculate ROAD distance by coordinates
  // ==========================================
  async calculateDistanceByCoords(originLat, originLng, destLat, destLng) {
    if (!this.apiKey) {
      throw new Error('Google Maps API key not configured');
    }

    try {
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json`;
      const params = {
        origins: `${originLat},${originLng}`,
        destinations: `${destLat},${destLng}`,
        mode: 'driving',
        key: this.apiKey,
        language: 'iw'
      };

      console.log('🗺️ Calculating ROAD distance via Google Maps...');

      const response = await axios.get(url, { params });
      
      if (response.data.status !== 'OK') {
        throw new Error(`Google API error: ${response.data.status}`);
      }

      const element = response.data.rows[0]?.elements[0];
      
      if (!element || element.status !== 'OK') {
        throw new Error('Cannot calculate distance - no route found');
      }
      
      const distanceMeters = element.distance.value;
      const distanceKm = distanceMeters / 1000;
      
      console.log('✅ Google Maps ROAD distance:', {
        from: `${originLat},${originLng}`,
        to: `${destLat},${destLng}`,
        distance: `${distanceKm} km`,
        duration: element.duration?.text
      });
      
      return parseFloat(distanceKm.toFixed(2));
    } catch (error) {
      console.error('❌ Distance calculation by coords error:', error.message);
      throw error;
    }
  }

  // ==========================================
  // Calculate distance between two addresses
  // ==========================================
  async calculateDistance(origin, destination) {
    if (!this.apiKey) {
      throw new Error('Google Maps API key not configured');
    }

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
        
        console.log('✅ Distance calculated (by address):', {
          from: origin,
          to: destination,
          distance: `${distanceKm} km`
        });
        
        return parseFloat(distanceKm.toFixed(2));
      }
      
      throw new Error('Cannot calculate distance');
    } catch (error) {
      console.error('Distance calculation error:', error);
      throw error;
    }
  }

  // ==========================================
  // Geocode address to coordinates
  // ==========================================
  async geocodeAddress(address) {
    if (!this.apiKey) {
      throw new Error('Google Maps API key not configured');
    }

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

  // ==========================================
  // Reverse geocode coordinates to address
  // ==========================================
  async reverseGeocode(lat, lng) {
    if (!this.apiKey) {
      throw new Error('Google Maps API key not configured');
    }

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
