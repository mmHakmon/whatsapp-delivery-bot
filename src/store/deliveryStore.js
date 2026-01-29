import { create } from 'zustand';

export const useDeliveryStore = create((set) => ({
  deliveries: [],
  activeDeliveries: [],
  selectedDelivery: null,
  
  setDeliveries: (deliveries) => set({ deliveries }),
  
  setActiveDeliveries: (activeDeliveries) => set({ activeDeliveries }),
  
  addDelivery: (delivery) => 
    set((state) => ({ 
      deliveries: [delivery, ...state.deliveries] 
    })),
  
  updateDelivery: (id, updates) =>
    set((state) => ({
      deliveries: state.deliveries.map((d) =>
        d.id === id ? { ...d, ...updates } : d
      ),
      activeDeliveries: state.activeDeliveries.map((d) =>
        d.id === id ? { ...d, ...updates } : d
      ),
    })),
  
  removeDelivery: (id) =>
    set((state) => ({
      deliveries: state.deliveries.filter((d) => d.id !== id),
      activeDeliveries: state.activeDeliveries.filter((d) => d.id !== id),
    })),
  
  setSelectedDelivery: (delivery) => set({ selectedDelivery: delivery }),
}));
