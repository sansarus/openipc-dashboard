// js/i18n.js
(function(window) {
    'use strict';
    window.AppModules = window.AppModules || {};

    AppModules.createI18n = function(App) {
        let translations = {};
        const supportedLangs = ['en', 'ru'];
        let currentLang = 'en';

        // Определяем язык браузера, если в настройках ничего нет
        const getPreferredLanguage = () => {
            const lang = (navigator.language || navigator.userLanguage).split('-')[0];
            return supportedLangs.includes(lang) ? lang : 'en';
        };

        // Загружаем файл локализации
        async function loadTranslations(lang) {
            try {
                const response = await fetch(`./locales/${lang}.json`);
                if (!response.ok) throw new Error(`Failed to load ${lang}.json`);
                translations = await response.json();
                currentLang = lang;
                document.documentElement.lang = lang;
                console.log(`Translations for '${lang}' loaded.`);
                return true;
            } catch (error) {
                console.error('Error loading translation file:', error);
                if (lang !== 'en') {
                    return await loadTranslations('en'); // fallback to English
                }
                return false;
            }
        }

        // Функция перевода
        function t(key, replacements = {}) {
            let translation = translations[key] || key;
            for (const placeholder in replacements) {
                translation = translation.replace(`{{${placeholder}}}`, replacements[placeholder]);
            }
            return translation;
        }

        // Применяем переводы ко всем статическим элементам на странице
        function applyTranslationsToDOM() {
            // Текстовое содержимое
            document.querySelectorAll('[data-i18n-key]').forEach(element => {
                const key = element.getAttribute('data-i18n-key');
                element.textContent = t(key);
            });
            // Всплывающие подсказки
            document.querySelectorAll('[data-i18n-tooltip]').forEach(element => {
                const key = element.getAttribute('data-i18n-tooltip');
                element.title = t(key);
            });
            // Плейсхолдеры в инпутах
            document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
                const key = element.getAttribute('data-i18n-placeholder');
                element.placeholder = t(key);
            });
        }
        
        // Функция для смены языка "на лету"
        async function setLanguage(lang) {
            if (!supportedLangs.includes(lang) || lang === currentLang) {
                return;
            }
            await loadTranslations(lang);
            applyTranslationsToDOM();
            
            // Перерисовываем компоненты, где текст генерируется динамически
            App.cameraList.render(); 
            App.gridManager.updatePlaceholdersLanguage(); // Обновляем плейсхолдеры в сетке
        }

        // Инициализация при старте приложения
        async function init() {
            // Сначала берем язык из настроек приложения, если он там есть
            const lang = App.appSettings.language || getPreferredLanguage();
            await loadTranslations(lang);
            applyTranslationsToDOM();
            App.t = t; // Делаем функцию перевода доступной глобально в App
        }

        return {
            init,
            t,
            setLanguage // Экспортируем функцию смены языка
        };
    };

})(window);