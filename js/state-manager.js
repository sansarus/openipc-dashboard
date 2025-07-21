// js/state-manager.js

(function(window) {
    'use strict';
    window.AppModules = window.AppModules || {};

    AppModules.createStateManager = function(config) {
        const subscribers = new Set();
        const mutations = config.mutations || {};
        
        // Основной объект состояния. Оборачиваем его в Proxy.
        const state = new Proxy(config.initialState || {}, {
            set(target, property, value) {
                // Устанавливаем новое значение
                target[property] = value;
                
                // Уведомляем всех "подписчиков" о том, что состояние изменилось
                console.log(`[State Change]: ${String(property)} changed. Notifying ${subscribers.size} subscribers.`);
                subscribers.forEach(callback => callback());
                
                return true;
            }
        });

        // Функция для подписки на изменения состояния
        const subscribe = (callback) => {
            subscribers.add(callback);
            // Возвращаем функцию для отписки
            return () => subscribers.delete(callback);
        };
        
        // Привязываем мутации к нашему менеджеру, чтобы они могли изменять состояние
        const boundMutations = {};
        for (const key in mutations) {
            boundMutations[key] = mutations[key].bind(null, state);
        }

        return {
            state,
            subscribe,
            ...boundMutations
        };
    };

})(window);