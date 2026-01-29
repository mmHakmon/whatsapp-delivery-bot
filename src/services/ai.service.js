const prisma = require('../config/database');

const aiService = {
  // למידה וחיזוי זמן משלוח
  async predictDeliveryTime(fromZone, toZone, distanceKm) {
    try {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const hourOfDay = now.getHours();

      // שליפת נתוני למידה דומים
      const learningData = await prisma.deliveryTimeLearning.findMany({
        where: {
          fromZone,
          toZone,
          dayOfWeek,
          hourOfDay: {
            gte: hourOfDay - 2,
            lte: hourOfDay + 2
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 20
      });

      if (learningData.length === 0) {
        // אין מספיק נתונים - חישוב בסיסי
        return this.basicTimeEstimate(distanceKm);
      }

      // חישוב ממוצע משוקלל
      const totalTime = learningData.reduce((sum, data) => sum + data.actualTimeMinutes, 0);
      const avgTime = totalTime / learningData.length;

      // התאמה למרחק הספציפי
      const avgDistance = learningData.reduce((sum, data) => sum + data.distanceKm, 0) / learningData.length;
      const distanceRatio = distanceKm / avgDistance;
      
      const predictedTime = Math.round(avgTime * distanceRatio);

      console.log(`🤖 AI Prediction: ${predictedTime} minutes for ${distanceKm}km`);

      return {
        predictedMinutes: predictedTime,
        confidence: this.calculateConfidence(learningData.length),
        basedOnSamples: learningData.length
      };
    } catch (error) {
      console.error('Error predicting delivery time:', error);
      return this.basicTimeEstimate(distanceKm);
    }
  },

  // שמירת נתוני למידה אחרי משלוח
  async saveDeliveryLearning(delivery) {
    try {
      if (!delivery.pickedUpAt || !delivery.deliveredAt) return;

      const actualTimeMinutes = Math.round(
        (delivery.deliveredAt - delivery.pickedUpAt) / 1000 / 60
      );

      // קביעת רמת פקקים לפי הזמן בפועל לעומת הבסיס
      const basicEstimate = this.basicTimeEstimate(delivery.distance);
      let trafficLevel = 'low';
      if (actualTimeMinutes > basicEstimate.predictedMinutes * 1.5) {
        trafficLevel = 'high';
      } else if (actualTimeMinutes > basicEstimate.predictedMinutes * 1.2) {
        trafficLevel = 'medium';
      }

      await prisma.deliveryTimeLearning.create({
        data: {
          deliveryId: delivery.id,
          fromZone: delivery.pickupCity || delivery.pickupZone || 'unknown',
          toZone: delivery.deliveryCity || delivery.deliveryZone || 'unknown',
          distanceKm: delivery.distance,
          actualTimeMinutes,
          trafficLevel,
          dayOfWeek: new Date(delivery.deliveredAt).getDay(),
          hourOfDay: new Date(delivery.deliveredAt).getHours()
        }
      });

      console.log(`📚 Learning data saved for delivery ${delivery.orderNumber}`);
    } catch (error) {
      console.error('Error saving learning data:', error);
    }
  },

  // חישוב בסיסי של זמן (fallback)
  basicTimeEstimate(distanceKm) {
    // בממוצע: 30 קמ"ש בעיר, 60 קמ"ש מחוץ לעיר
    const avgSpeed = distanceKm < 10 ? 30 : 50;
    const predictedMinutes = Math.round((distanceKm / avgSpeed) * 60);
    
    return {
      predictedMinutes,
      confidence: 'low',
      basedOnSamples: 0
    };
  },

  // חישוב רמת ביטחון בחיזוי
  calculateConfidence(samplesCount) {
    if (samplesCount >= 15) return 'high';
    if (samplesCount >= 8) return 'medium';
    return 'low';
  },

  // חיזוי עומס תנועה
  async predictTrafficLevel(zone, hourOfDay = new Date().getHours()) {
    try {
      const learningData = await prisma.deliveryTimeLearning.findMany({
        where: {
          OR: [
            { fromZone: zone },
            { toZone: zone }
          ],
          hourOfDay: {
            gte: hourOfDay - 1,
            lte: hourOfDay + 1
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 30
      });

      if (learningData.length === 0) {
        return 'unknown';
      }

      const trafficCounts = {
        low: 0,
        medium: 0,
        high: 0
      };

      learningData.forEach(data => {
        trafficCounts[data.trafficLevel]++;
      });

      // מציאת הרמה הנפוצה ביותר
      const maxTraffic = Object.keys(trafficCounts).reduce((a, b) => 
        trafficCounts[a] > trafficCounts[b] ? a : b
      );

      return maxTraffic;
    } catch (error) {
      console.error('Error predicting traffic:', error);
      return 'unknown';
    }
  },

  // המלצה על שליח מתאים למשלוח
  async recommendCourier(delivery) {
    try {
      // שליחים זמינים ופעילים
      const availableCouriers = await prisma.courier.findMany({
        where: {
          isActive: true,
          isAvailable: true,
          vehicleType: delivery.vehicleType
        },
        include: {
          performance: {
            orderBy: {
              date: 'desc'
            },
            take: 7
          }
        }
      });

      if (availableCouriers.length === 0) return null;

      // חישוב ציון לכל שליח
      const scoredCouriers = availableCouriers.map(courier => {
        let score = 0;

        // ציון דירוג
        score += courier.rating * 20;

        // ציון שיעור השלמה
        if (courier.totalDeliveries > 0) {
          const completionRate = courier.completedDeliveries / courier.totalDeliveries;
          score += completionRate * 30;
        }

        // ציון מרחק (אם יש מיקום נוכחי)
        if (courier.currentLat && courier.currentLng && delivery.pickupLat && delivery.pickupLng) {
          const distance = this.calculateDistance(
            courier.currentLat, courier.currentLng,
            delivery.pickupLat, delivery.pickupLng
          );
          // ציון גבוה יותר לקרובים
          score += Math.max(0, 50 - distance);
        }

        return { courier, score };
      });

      // מיון לפי ציון
      scoredCouriers.sort((a, b) => b.score - a.score);

      return scoredCouriers[0].courier;
    } catch (error) {
      console.error('Error recommending courier:', error);
      return null;
    }
  },

  // חישוב מרחק בין שתי נקודות (Haversine formula)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // רדיוס כדור הארץ בק"מ
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }
};

module.exports = aiService;
