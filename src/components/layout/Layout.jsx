import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import { useEffect } from 'react';
import { socketService } from '../../services/socket';
import { useDeliveryStore } from '../../store/deliveryStore';
import { useNotificationStore } from '../../store/notificationStore';
import toast from 'react-hot-toast';

export default function Layout() {
  const updateDelivery = useDeliveryStore((state) => state.updateDelivery);
  const addNotification = useNotificationStore((state) => state.addNotification);

  useEffect(() => {
    // התחברות ל-Socket
    socketService.connect();

    // האזנה לאירועי משלוחים
    socketService.on('new-delivery', (delivery) => {
      toast.success(`משלוח חדש: ${delivery.orderNumber}`);
      addNotification({
        type: 'delivery',
        title: 'משלוח חדש',
        message: `משלוח ${delivery.orderNumber} נוצר`,
        data: delivery,
      });
    });

    socketService.on('delivery-claimed', (delivery) => {
      updateDelivery(delivery.id, delivery);
      toast.info(`משלוח ${delivery.orderNumber} נתפס`);
    });

    socketService.on('delivery-picked-up', (delivery) => {
      updateDelivery(delivery.id, delivery);
      toast.info(`משלוח ${delivery.orderNumber} נאסף`);
    });

    socketService.on('delivery-completed', (delivery) => {
      updateDelivery(delivery.id, delivery);
      toast.success(`משלוח ${delivery.orderNumber} הושלם!`);
    });

    socketService.on('delivery-cancelled', (delivery) => {
      updateDelivery(delivery.id, delivery);
      toast.error(`משלוח ${delivery.orderNumber} בוטל`);
    });

    socketService.on('courier-location', ({ courierId, lat, lng }) => {
      // עדכון מיקום שליח במפה
      console.log('Courier location updated:', { courierId, lat, lng });
    });

    return () => {
      socketService.disconnect();
    };
  }, []);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
