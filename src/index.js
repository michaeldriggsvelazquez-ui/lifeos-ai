export default {
  async fetch(request) {
    return new Response(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>LifeOS AI</title>
        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: Arial, sans-serif;
            background: #08080c;
            color: white;
            text-align: center;
          }

          .container {
            width: min(90%, 700px);
            padding: 40px 25px;
          }

          .logo {
            font-size: 18px;
            font-weight: bold;
            letter-spacing: 3px;
            margin-bottom: 35px;
          }

          h1 {
            font-size: clamp(42px, 10vw, 80px);
            margin: 0;
            line-height: 1;
          }

          h1 span {
            opacity: 0.55;
          }

          p {
            font-size: 18px;
            line-height: 1.6;
            opacity: 0.7;
            margin: 25px auto 35px;
            max-width: 500px;
          }

          button {
            border: 0;
            border-radius: 12px;
            padding: 16px 28px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
          }
        </style>
      </head>

      <body>
        <main class="container">
          <div class="logo">LIFEOS AI</div>

          <h1>
            Tu vida.<br>
            <span>Organizada.</span>
          </h1>

          <p>
            Dile a LifeOS qué tienes que hacer.
            Nosotros organizamos el resto.
          </p>

          <button onclick="alert('LifeOS AI está cobrando vida 🚀')">
            Comenzar
          </button>
        </main>
      </body>
      </html>
    `, {
      headers: {
        "content-type": "text/html;charset=UTF-8"
      }
    });
  }
};
