module.exports = {
  ORDER_STATUS: {
    NEW: 'new',
    PUBLISHED: 'published',
    TAKEN: 'taken',
    PICKED: 'picked',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled'
  },

  COURIER_STATUS: {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    BLOCKED: 'blocked'
  },

  PAYMENT_STATUS: {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    COMPLETED: 'completed'
  },

  USER_ROLES: {
    ADMIN: 'admin',
    MANAGER: 'manager',
    AGENT: 'agent'
  },

  VEHICLE_TYPES: {
    MOTORCYCLE: 'motorcycle',
    CAR: 'car',
    VAN: 'van',
    TRUCK: 'truck'
  },

  WEBSOCKET_EVENTS: {
    NEW_ORDER: 'new_order',
    ORDER_UPDATED: 'order_updated',
    ORDER_TAKEN: 'order_taken',
    ORDER_PICKED: 'order_picked',
    ORDER_DELIVERED: 'order_delivered',
    ORDER_CANCELLED: 'order_cancelled',
    COURIER_LOCATION: 'courier_location'
  }
};