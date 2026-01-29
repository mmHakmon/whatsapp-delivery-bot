const prisma = require('../config/database');
const ExcelJS = require('exceljs');
const moment = require('moment-timezone');

moment.tz.setDefault('Asia/Jerusalem');

const reportService = {
  // דוח יומי
  async generateDailyReport(date = new Date()) {
    try {
      const startOfDay = moment(date).startOf('day').toDate();
      const endOfDay = moment(date).endOf('day').toDate();

      const deliveries = await prisma.delivery.findMany({
        where: {
          createdAt: {
            gte: startOfDay,
            lte: endOfDay
          }
        },
        include: {
          courier: true,
          createdBy: true
        }
      });

      const stats = {
        totalDeliveries: deliveries.length,
        completed: deliveries.filter(d => d.status === 'completed').length,
        pending: deliveries.filter(d => d.status === 'pending').length,
        inProgress: deliveries.filter(d => ['claimed', 'picked_up', 'in_transit'].includes(d.status)).length,
        cancelled: deliveries.filter(d => d.status === 'cancelled').length,
        totalRevenue: deliveries.reduce((sum, d) => sum + (d.finalPrice || 0), 0),
        companyEarnings: deliveries.reduce((sum, d) => sum + (d.companyEarnings || 0), 0),
        courierEarnings: deliveries.reduce((sum, d) => sum + (d.courierEarnings || 0), 0)
      };

      return {
        date: moment(date).format('DD/MM/YYYY'),
        stats,
        deliveries
      };
    } catch (error) {
      console.error('Error generating daily report:', error);
      throw error;
    }
  },

  // דוח שבועי
  async generateWeeklyReport(startDate = null) {
    try {
      const start = startDate ? moment(startDate) : moment().subtract(7, 'days');
      const end = moment();

      const deliveries = await prisma.delivery.findMany({
        where: {
          createdAt: {
            gte: start.toDate(),
            lte: end.toDate()
          }
        },
        include: {
          courier: true
        }
      });

      // קיבוץ לפי ימים
      const dailyStats = {};
      
      for (let m = moment(start); m.isBefore(end); m.add(1, 'day')) {
        const dayKey = m.format('DD/MM/YYYY');
        const dayDeliveries = deliveries.filter(d => 
          moment(d.createdAt).format('DD/MM/YYYY') === dayKey
        );

        dailyStats[dayKey] = {
          total: dayDeliveries.length,
          completed: dayDeliveries.filter(d => d.status === 'completed').length,
          revenue: dayDeliveries.reduce((sum, d) => sum + (d.finalPrice || 0), 0)
        };
      }

      return {
        period: `${start.format('DD/MM/YYYY')} - ${end.format('DD/MM/YYYY')}`,
        totalDeliveries: deliveries.length,
        totalRevenue: deliveries.reduce((sum, d) => sum + (d.finalPrice || 0), 0),
        dailyStats,
        deliveries
      };
    } catch (error) {
      console.error('Error generating weekly report:', error);
      throw error;
    }
  },

  // ייצוא לאקסל
  async exportToExcel(deliveries, filename = 'deliveries_report.xlsx') {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('משלוחים');

      // הגדרת עמודות
      worksheet.columns = [
        { header: 'מספר הזמנה', key: 'orderNumber', width: 20 },
        { header: 'תאריך', key: 'date', width: 15 },
        { header: 'סוג רכב', key: 'vehicleType', width: 12 },
        { header: 'כתובת איסוף', key: 'pickupAddress', width: 30 },
        { header: 'כתובת מסירה', key: 'deliveryAddress', width: 30 },
        { header: 'מרחק (ק"מ)', key: 'distance', width: 12 },
        { header: 'מחיר סופי', key: 'finalPrice', width: 12 },
        { header: 'רווח שליח', key: 'courierEarnings', width: 12 },
        { header: 'רווח חברה', key: 'companyEarnings', width: 12 },
        { header: 'שליח', key: 'courierName', width: 20 },
        { header: 'סטטוס', key: 'status', width: 15 }
      ];

      // הוספת נתונים
      deliveries.forEach(delivery => {
        worksheet.addRow({
          orderNumber: delivery.orderNumber,
          date: moment(delivery.createdAt).format('DD/MM/YYYY HH:mm'),
          vehicleType: this.translateVehicleType(delivery.vehicleType),
          pickupAddress: delivery.pickupAddress,
          deliveryAddress: delivery.deliveryAddress,
          distance: delivery.distance || 0,
          finalPrice: delivery.finalPrice || 0,
          courierEarnings: delivery.courierEarnings || 0,
          companyEarnings: delivery.companyEarnings || 0,
          courierName: delivery.courier?.name || 'לא משויך',
          status: this.translateStatus(delivery.status)
        });
      });

      // עיצוב כותרות
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };

      // שמירה
      const buffer = await workbook.xlsx.writeBuffer();
      return buffer;
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      throw error;
    }
  },

  translateVehicleType(type) {
    const types = {
      'motorcycle': 'אופנוע',
      'car': 'רכב',
      'van': 'טנדר',
      'truck': 'משאית'
    };
    return types[type] || type;
  },

  translateStatus(status) {
    const statuses = {
      'pending': 'ממתין',
      'published': 'מפורסם',
      'claimed': 'נתפס',
      'picked_up': 'נאסף',
      'in_transit': 'בדרך',
      'delivered': 'נמסר',
      'completed': 'הושלם',
      'cancelled': 'בוטל'
    };
    return statuses[status] || status;
  }
};

module.exports = reportService;
