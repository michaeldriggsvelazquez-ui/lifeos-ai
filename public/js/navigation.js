/* Scarpe AI - Navigation System */

(function () {
    "use strict";

    let touchStartX = 0;
    let touchStartY = 0;
    let touchTracking = false;

    function getSidebar() {
        return document.getElementById("sidebar");
    }

    function getScreens() {
        return document.querySelectorAll(".screen");
    }

    function showScreen(screenId) {
        const screens = getScreens();

        screens.forEach(function (screen) {
            screen.classList.remove("active");
        });

        const target = document.getElementById(screenId);

        if (target) {
            target.classList.add("active");
        }

        document.querySelectorAll("[data-screen]").forEach(function (button) {
            button.classList.toggle(
                "active",
                button.getAttribute("data-screen") === screenId
            );
        });

        closeSidebar();
    }

    function toggleSidebar() {
        const sidebar = getSidebar();

        if (!sidebar) {
            return;
        }

        sidebar.classList.toggle("open");
    }

    function openSidebar() {
        const sidebar = getSidebar();

        if (!sidebar) {
            return;
        }

        sidebar.classList.add("open");
    }

    function closeSidebar() {
        const sidebar = getSidebar();

        if (!sidebar) {
            return;
        }

        sidebar.classList.remove("open");
    }

    /*
        Mobile swipe:
        comienza únicamente desde los primeros 28px
        del borde izquierdo y exige un desplazamiento
        horizontal suficientemente claro.
    */

    document.addEventListener(
        "touchstart",
        function (event) {
            if (window.innerWidth > 800) {
                return;
            }

            const touch = event.touches[0];

            if (!touch) {
                return;
            }

            touchStartX = touch.clientX;
            touchStartY = touch.clientY;

            touchTracking = touchStartX <= 28;
        },
        { passive: true }
    );

    document.addEventListener(
        "touchend",
        function (event) {
            if (window.innerWidth > 800 || !touchTracking) {
                return;
            }

            const touch = event.changedTouches[0];

            if (!touch) {
                touchTracking = false;
                return;
            }

            const deltaX = touch.clientX - touchStartX;
            const deltaY = Math.abs(touch.clientY - touchStartY);

            touchTracking = false;

            if (
                deltaX > 70 &&
                deltaX > deltaY * 1.4
            ) {
                openSidebar();
            }
        },
        { passive: true }
    );

    /*
        Cerrar sidebar al pulsar fuera de él.
    */

    document.addEventListener("click", function (event) {
        const sidebar = getSidebar();

        if (!sidebar || !sidebar.classList.contains("open")) {
            return;
        }

        const clickedInsideSidebar =
            sidebar.contains(event.target);

        const clickedMenuButton =
            event.target.closest &&
            event.target.closest(
                "#mobileMenu, .mobile-menu"
            );

        if (
            !clickedInsideSidebar &&
            !clickedMenuButton
        ) {
            closeSidebar();
        }
    });

    /*
        Exponer únicamente las funciones que necesita
        el HTML existente y los módulos futuros.
    */

    window.showScreen = showScreen;
    window.toggleSidebar = toggleSidebar;
    window.openSidebar = openSidebar;
    window.closeSidebar = closeSidebar;

})();
