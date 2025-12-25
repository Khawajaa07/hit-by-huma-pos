import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      currentLocation: null,
      currentShift: null,

      login: async (employeeCode, password, openingCash = 0) => {
        try {
          const response = await api.post('/auth/login', {
            employeeCode,
            password,
            openingCash
          });
          const { user, accessToken, refreshToken, shift } = response.data;

          set({
            user,
            accessToken,
            refreshToken,
            isAuthenticated: true,
            currentLocation: user.locationId ? {
              id: user.locationId,
              name: user.locationName,
            } : null,
            currentShift: shift,
          });

          // Set token in API client
          api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

          return { success: true, isSalesman: user.isSalesman };
        } catch (error) {
          return {
            success: false,
            error: error.response?.data?.message || 'Login failed'
          };
        }
      },

      logout: async () => {
        const { user, currentShift } = get();

        try {
          // If salesman with open shift, close shift on logout
          if (user?.isSalesman && currentShift) {
            await api.post('/auth/logout', {
              closingCash: currentShift.closingCash || 0
            });
          }
        } catch (error) {
          console.error('Error closing shift on logout:', error);
        }

        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          currentLocation: null,
          currentShift: null,
        });
        delete api.defaults.headers.common['Authorization'];
      },

      refreshAccessToken: async () => {
        try {
          const { refreshToken } = get();
          if (!refreshToken) throw new Error('No refresh token');

          const response = await api.post('/auth/refresh', { refreshToken });
          const { accessToken } = response.data;

          set({ accessToken });
          api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

          return accessToken;
        } catch (error) {
          get().logout();
          throw error;
        }
      },

      setCurrentShift: (shift) => set({ currentShift: shift }),

      setCurrentLocation: (location) => set({ currentLocation: location }),

      // Check if user is a salesman
      isSalesman: () => {
        const { user } = get();
        return user?.role === 'salesman' || user?.isSalesman === true;
      },

      // Check if user is admin or manager  
      isAdminOrManager: () => {
        const { user } = get();
        return user?.role === 'admin' || user?.role === 'manager';
      },

      hasPermission: (permission) => {
        const { user } = get();
        if (!user?.permissions) return false;

        // Handle permissions as object (new format)
        if (typeof user.permissions === 'object' && !Array.isArray(user.permissions)) {
          // Admin has all permissions
          if (user.permissions['*'] || user.permissions.all === true) return true;

          // Check exact match
          if (user.permissions[permission]) return true;

          // Check category wildcard (e.g., "pos" grants "pos.sale")
          const category = permission.split('.')[0];
          return user.permissions[category] === true;
        }

        // Handle permissions as array (old format)
        if (Array.isArray(user.permissions)) {
          if (user.permissions.includes('*')) return true;
          if (user.permissions.includes(permission)) return true;

          const wildcardPermission = permission.split('.')[0] + '.*';
          return user.permissions.includes(wildcardPermission);
        }

        return false;
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        currentLocation: state.currentLocation,
        currentShift: state.currentShift,
      }),
    }
  )
);

// Initialize auth on app load
const initializeAuth = () => {
  const { accessToken, isAuthenticated } = useAuthStore.getState();
  if (isAuthenticated && accessToken) {
    api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
  }
};

initializeAuth();
