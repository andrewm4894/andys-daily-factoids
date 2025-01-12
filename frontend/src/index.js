import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import posthog from 'posthog-js'

// Google Analytics setup
(function() {
    window.dataLayer = window.dataLayer || [];
    function gtag(){ window.dataLayer.push(arguments); }
    window.gtag = gtag;
  
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=G-166EKKM3RW';
    document.head.appendChild(script);
  
    script.onload = () => {
      gtag('js', new Date());
      gtag('config', 'G-166EKKM3RW');
    };
  })();

// initialize posthog
posthog.init('phc_FBwJgNVOyAez7il4IvxxhzPuB4YFFBGtanSfm3InYJ5',
    {
        api_host: 'https://us.i.posthog.com',
        person_profiles: 'always'
    }
)

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
