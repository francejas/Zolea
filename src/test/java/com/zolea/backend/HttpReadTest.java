package com.zolea.backend;

import com.zolea.backend.models.Amenity;
import com.zolea.backend.models.Booking;
import com.zolea.backend.models.Client;
import com.zolea.backend.models.RentalUnit;
import com.zolea.backend.models.Resort;
import com.zolea.backend.models.Status;
import com.zolea.backend.models.UnitType;
import com.zolea.backend.repositories.AmenityRepository;
import com.zolea.backend.security.JwtUtil;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.support.IntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import java.util.ArrayList;
import java.util.List;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Las lecturas que devuelven colecciones anidadas, pedidas por HTTP.
 *
 * <p>Son la red de seguridad del bloque C. Hoy funcionan por {@code spring.jpa.open-in-view=true}:
 * los mappers de los servicios recorren colecciones LAZY —los huéspedes de una reserva, las
 * reservas de un cliente, las amenidades y unidades de un balneario— <b>fuera</b> de toda
 * transacción, y solo andan porque esa opción deja la sesión de base abierta mientras se arma la
 * respuesta. Es decir: la transacción existe, pero no la decidió nadie.
 *
 * <p>Apagar esa opción sin haber movido el mapeo adentro de una transacción rompe estos seis
 * endpoints de una, con {@code LazyInitializationException}. Por eso las pruebas se escriben
 * <b>antes</b> del cambio: verifican que hoy andan, y son las que tienen que seguir en verde
 * después.
 *
 * <p>Cada prueba afirma sobre el contenido anidado, no solo sobre el código de estado: un 200 con
 * la lista vacía pasaría igual sin haber cargado nada.
 */
@AutoConfigureMockMvc
@DisplayName("Lecturas HTTP — colecciones anidadas")
class HttpReadTest extends IntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;
    @Autowired private AmenityRepository amenityRepository;

    private String tokenFor(Client client) {
        return jwtUtil.generateToken(UserPrincipal.de(client));
    }

    /**
     * Un balneario con una amenidad y dos unidades: las dos colecciones anidadas de Resort.
     *
     * <p>Las unidades <b>no</b> se asignan a {@code resort.rentalUnits}: ese es el lado inverso de
     * la relación y no persiste nada — la unidad ya apunta al balneario. Las amenidades sí, porque
     * ahí el lado dueño es {@code Resort}. Va un {@code ArrayList} y no un {@code List.of}: la
     * lista se la queda Hibernate y una inmutable revienta al gestionarla.
     */
    private Resort aFullResort() {
        Resort resort = aResort();
        Amenity amenity = new Amenity();
        amenity.setName("Pileta " + resort.getIdResort());
        amenity = amenityRepository.save(amenity);
        resort.setAmenities(new ArrayList<>(List.of(amenity)));
        aUnitIn(resort, 5_000.0);
        aUnitIn(resort, 6_000.0);
        return resortRepository.save(resort);
    }

    // ---------------------------------------------------------------------
    // Balnearios — amenidades (N:M) y unidades (1:N)
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("el detalle de un balneario trae sus amenidades y sus unidades")
    void resortDetail_bringsAmenitiesAndUnits() throws Exception {
        Resort resort = aFullResort();

        syncWithDatabase();

        mockMvc.perform(get("/api/resorts/" + resort.getIdResort()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amenities", hasSize(1)))
                .andExpect(jsonPath("$.rentalUnits", hasSize(2)))
                .andExpect(jsonPath("$.rentalUnits[0].identifier").exists());
    }

    @Test
    @DisplayName("el listado público de balnearios trae las colecciones anidadas de cada uno")
    void resortList_bringsTheCollections() throws Exception {
        aFullResort();

        syncWithDatabase();

        mockMvc.perform(get("/api/resorts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(greaterThanOrEqualTo(1))))
                .andExpect(jsonPath("$[0].rentalUnits", hasSize(2)))
                .andExpect(jsonPath("$[0].amenities", hasSize(1)));
    }

    // ---------------------------------------------------------------------
    // Clientes — reservas (1:N), y dentro de cada una la unidad reservada
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("el perfil de un cliente trae el resumen de sus reservas")
    void clientProfile_bringsTheirBookings() throws Exception {
        Client client = aClient();
        aBooking(client, aUnit(5_000.0),
                today().plusDays(5), today().plusDays(7), Status.CONFIRMED, now());

        syncWithDatabase();

        mockMvc.perform(get("/api/clients/" + client.getIdClient())
                        .header("Authorization", "Bearer " + tokenFor(client)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bookings", hasSize(1)))
                // rentalUnitIdentifier obliga a recorrer Booking -> RentalUnit, otra relación más
                .andExpect(jsonPath("$.bookings[0].rentalUnitIdentifier").exists());
    }

    @Test
    @DisplayName("el listado de clientes del admin trae las reservas de cada uno")
    void clientList_bringsTheirBookings() throws Exception {
        Resort mio = aResort();
        Client admin = anAdminOf(mio);
        Client client = aClient();
        aBooking(client, aUnitIn(mio, 5_000.0),
                today().plusDays(5), today().plusDays(7), Status.CONFIRMED, now());

        syncWithDatabase();

        mockMvc.perform(get("/api/clients")
                        .header("Authorization", "Bearer " + tokenFor(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.idClient == " + client.getIdClient() + ")].bookings[0].rentalUnitIdentifier")
                        .exists());
    }

    // ---------------------------------------------------------------------
    // Reservas — huéspedes (1:N) y el balneario a través de la unidad
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("el detalle de una reserva trae sus huéspedes y el balneario")
    void bookingDetail_bringsGuestsAndResort() throws Exception {
        Client client = aClient();
        RentalUnit unit = aUnit(5_000.0);
        Booking booking = aBooking(client, unit,
                today().plusDays(5), today().plusDays(7), Status.CONFIRMED, now());
        aGuest(booking, "Titular Uno", client.getDni());
        aGuest(booking, "Acompañante", "40999888");

        syncWithDatabase();

        mockMvc.perform(get("/api/bookings/" + booking.getId())
                        .header("Authorization", "Bearer " + tokenFor(client)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.guests", hasSize(2)))
                .andExpect(jsonPath("$.guests[0].qrToken").exists())
                // resortName sale de Booking -> RentalUnit -> Resort
                .andExpect(jsonPath("$.resortName").exists());
    }

    @Test
    @DisplayName("las reservas de un cliente traen sus huéspedes")
    void clientBookings_bringTheirGuests() throws Exception {
        Client client = aClient();
        Booking booking = aBooking(client, aUnit(5_000.0),
                today().plusDays(5), today().plusDays(7), Status.CONFIRMED, now());
        aGuest(booking, "Titular Uno", client.getDni());

        syncWithDatabase();

        mockMvc.perform(get("/api/bookings/client/" + client.getIdClient())
                        .header("Authorization", "Bearer " + tokenFor(client)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].guests", hasSize(1)))
                .andExpect(jsonPath("$[0].resortName").exists());
    }

    // ---------------------------------------------------------------------
    // Reservas — la unidad, por su identificador («A-01») y no solo su número interno
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("el detalle de una reserva trae el identificador y el tipo de la unidad")
    void bookingDetail_bringsUnitIdentifierAndType() throws Exception {
        Client client = aClient();
        RentalUnit unit = aUnit(5_000.0);
        unit.setType(UnitType.TENT);
        rentalUnitRepository.save(unit);
        Booking booking = aBooking(client, unit,
                today().plusDays(5), today().plusDays(7), Status.CONFIRMED, now());

        syncWithDatabase();

        mockMvc.perform(get("/api/bookings/" + booking.getId())
                        .header("Authorization", "Bearer " + tokenFor(client)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rentalUnitId").value(unit.getIdRentalUnit()))
                .andExpect(jsonPath("$.rentalUnitIdentifier").value(unit.getIdentifier()))
                .andExpect(jsonPath("$.rentalUnitType").value("TENT"));
    }

    @Test
    @DisplayName("las reservas de un cliente traen el identificador y el tipo de la unidad")
    void clientBookings_bringUnitIdentifierAndType() throws Exception {
        Client client = aClient();
        RentalUnit unit = aUnit(5_000.0);
        aBooking(client, unit, today().plusDays(5), today().plusDays(7), Status.CONFIRMED, now());

        syncWithDatabase();

        mockMvc.perform(get("/api/bookings/client/" + client.getIdClient())
                        .header("Authorization", "Bearer " + tokenFor(client)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].rentalUnitIdentifier").value(unit.getIdentifier()))
                .andExpect(jsonPath("$[0].rentalUnitType").value("UMBRELLA"));
    }

    @Test
    @DisplayName("las reservas del balneario traen el identificador y el tipo de la unidad")
    void resortBookings_bringUnitIdentifierAndType() throws Exception {
        Resort resort = aResort();
        RentalUnit unit = aUnitIn(resort, 5_000.0);
        aBooking(aClient(), unit, today().plusDays(5), today().plusDays(7), Status.CONFIRMED, now());

        syncWithDatabase();

        mockMvc.perform(get("/api/bookings")
                        .header("Authorization", "Bearer " + tokenFor(anAdminOf(resort))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].rentalUnitIdentifier").value(unit.getIdentifier()))
                .andExpect(jsonPath("$[0].rentalUnitType").value("UMBRELLA"));
    }
}
