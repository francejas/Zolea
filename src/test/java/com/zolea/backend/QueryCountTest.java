package com.zolea.backend;

import com.zolea.backend.models.Booking;
import com.zolea.backend.models.Client;
import com.zolea.backend.models.Resort;
import com.zolea.backend.models.Status;
import com.zolea.backend.security.JwtUtil;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.support.IntegrationTest;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import jakarta.persistence.EntityManagerFactory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Cuántas consultas dispara un listado.
 *
 * <p>El problema que mide es el «N+1»: una consulta para traer la lista y después <b>una más por
 * cada elemento</b> para traer sus relaciones. Con 47 reservas eso son decenas de idas y vueltas a
 * la base; en local no se nota, a través del túnel de la demostración sí.
 *
 * <p>La prueba cuenta las consultas reales con las estadísticas de Hibernate, en lugar de dar la
 * mejora por supuesta. Los límites salen de una medición, no de un número redondo elegido a gusto:
 *
 * <ul>
 *   <li>10 reservas: <b>33</b> consultas antes, <b>5 o menos</b> ahora. Eran 3; la cuarta llegó con
 *       las reseñas (14.1) y averigua cuáles ya se calificaron, y la quinta con los pagos (15.4) y
 *       trae los cobros registrados; cada una, una sola vez para todo el listado.
 *   <li>5 balnearios con 2 unidades cada uno: <b>11</b> consultas antes, <b>4 o menos</b> ahora.
 * </ul>
 *
 * <p>Al ser un límite ajustado y no uno holgado, si alguien vuelve a introducir un N+1 en estos
 * endpoints la prueba se pone en rojo enseguida.
 */
@AutoConfigureMockMvc
@DisplayName("Consultas — sin N+1 en los listados")
class QueryCountTest extends IntegrationTest {

    /** Cuántas reservas se crean para medir. Cuanto más alto, más se separa N+1 de lo acotado. */
    private static final int HOW_MANY = 10;

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;
    @Autowired private EntityManagerFactory entityManagerFactory;

    private Statistics statistics() {
        return entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
    }

    private String tokenFor(Client client) {
        return jwtUtil.generateToken(UserPrincipal.de(client));
    }

    @Test
    @DisplayName("listar las reservas del balneario no dispara una consulta por reserva")
    void listBookings_isNotOneQueryPerBooking() throws Exception {
        Resort resort = aResort();
        Client admin = anAdminOf(resort);
        for (int i = 0; i < HOW_MANY; i++) {
            Booking booking = aBooking(aClient(), aUnitIn(resort, 5_000.0),
                    today().plusDays(2 + i * 5), today().plusDays(4 + i * 5), Status.CONFIRMED, now());
            aGuest(booking, "Huesped " + i, "4000000" + i);
        }
        syncWithDatabase();

        Statistics stats = statistics();
        stats.clear();

        mockMvc.perform(get("/api/bookings")
                        .header("Authorization", "Bearer " + tokenFor(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(HOW_MANY));

        long consultas = stats.getPrepareStatementCount();
        assertThat(consultas)
                .withFailMessage("el listado disparó %d consultas para %d reservas", consultas, HOW_MANY)
                .isLessThanOrEqualTo(5);
    }

    @Test
    @DisplayName("listar los balnearios no dispara una consulta por balneario")
    void listResorts_isNotOneQueryPerResort() throws Exception {
        for (int i = 0; i < 5; i++) {
            Resort resort = aResort();
            aUnitIn(resort, 5_000.0);
            aUnitIn(resort, 6_000.0);
        }
        syncWithDatabase();

        Statistics stats = statistics();
        stats.clear();

        mockMvc.perform(get("/api/resorts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", org.hamcrest.Matchers.hasSize(5)));

        long consultas = stats.getPrepareStatementCount();
        assertThat(consultas)
                .withFailMessage("el listado disparó %d consultas para 5 balnearios con 2 unidades cada uno",
                        consultas)
                .isLessThanOrEqualTo(4);
    }
}
