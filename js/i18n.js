// js/i18n.js
(function(window) {
    'use strict';
    window.AppModules = window.AppModules || {};

    AppModules.createI18n = function(App) {
        let translations = {};
        const supportedLangs = ['en', 'ru'];
        let currentLang = 'en';

        const getPreferredLanguage = () => {
            const lang = (navigator.language || navigator.userLanguage).split('-')[0];
            return supportedLangs.includes(lang) ? lang : 'en';
        };

        async function loadTranslations(lang) {
            try {
                // ИЗМЕНЕНИЕ: Загрузка переводов через main процесс для надежности
                const loadedTranslations = await window.api.getTranslationFile(lang);
                if (!loadedTranslations) throw new Error(`Failed to load ${lang}.json`);
                
                translations = loadedTranslations;
                currentLang = lang;
                document.documentElement.lang = lang;
                console.log(`Translations for '${lang}' loaded.`);
                return true;
            } catch (error) {
                console.error('Error loading translation file:', error);
                if (lang !== 'en') {
                    console.log('Falling back to English.');
                    return await loadTranslations('en'); // fallback to English
                }
                return false;
            }
        }

        function t(key, replacements = {}) {
            let translation = translations[key] || key;
            for (const placeholder in replacements) {
                translation = translation.replace(`{{${placeholder}}}`, replacements[placeholder]);
            }
            return translation;
        }

        function applyTranslationsToDOM() {
            document.querySelectorAll('[data-i18n-key]').forEach(element => {
                const key = element.getAttribute('data-i18n-key');
                element.textContent = t(key);
            });
            document.querySelectorAll('[data-i18n-tooltip]').forEach(element => {
                const key = element.getAttribute('data-i18n-tooltip');
                element.title = t(key);
            });
            document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
                const key = element.getAttribute('data-i18n-placeholder');
                element.placeholder = t(key);
            });
        }
        
        // ИЗМЕНЕНИЕ: Функция теперь напрямую вызывает обновление DOM и событие
        async function setLanguage(lang) {
            if (!supportedLangs.includes(lang) || lang === currentLang) {
                return;
            }
            const success = await loadTranslations(lang);
            if (success) {
                applyTranslationsToDOM();
                // Генерируем событие, чтобы другие модули могли на него отреагировать
                window.dispatchEvent(new CustomEvent('language-changed'));
            }
        }

        async function init() {
            const lang = App.appSettings.language || getPreferredLanguage();
            await loadTranslations(lang);
            App.t = t; // Делаем функцию перевода доступной глобально в App
            applyTranslationsToDOM(); // Первоначальный перевод
        }

        return {
            init,
            t,
            setLanguage,
            applyTranslationsToDOM // Экспортируем на всякий случай
        };
    };
})(window);