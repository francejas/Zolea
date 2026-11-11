package com.zolea.backend;

import com.zolea.backend.config.TimeConfig;
import com.zolea.backend.models.Amenity;
import com.zolea.backend.models.RentalUnit;
import com.zolea.backend.models.Resort;
import com.zolea.backend.models.Status;
import com.zolea.backend.models.UnitType;
import com.zolea.backend.repositories.AmenityRepository;
import com.zolea.backend.support.IntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Búsqueda, el tercero de los requisitos del TFI: balnearios con lugar libre en ciertas fechas, y
 * qué unidades de un balneario están ocupadas.
 *
 * <p>Antes la portada solo filtraba por texto y el plano solo conocía las unidades bloqueadas, así
 * que una unidad ocupada en esas fechas recién fallaba al reservar.
 *
 * <p>Ocupada es la unidad con una reserva pendiente o confirmada que se superpone con las fechas,
 * contando los dos extremos: la misma regla que aplica {@code BookingRepository.isUnitAvailable}
 * al reservar. Si la búsqueda y la reserva contaran distinto, la portada ofrecería un lugar que
 * después no se puede reservar.
 *
 * <p>El reloj queda fijo en el 10/01/2026, así «una fecha que ya pasó» es siempre la misma.
 */
@AutoConfigureMockMvc
@Import(ResortSearchTest.FixedClock.class)
@DisplayName("Búsqueda — balnearios con lugar libre y unidades ocupadas")
class ResortSearchTest extends IntegrationTest {

    /** Las fechas que se buscan en casi todas las pruebas: del 15 al 17 de enero, tres días. */
    private static final String DATES = "from=2026-01-15&to=2026-01-17";

    @Autowired private MockMvc mockMvc;
    @Autowired private AmenityRepository amenityRepository;

    private static LocalDate january(int day) {
        return LocalDate.of(2026, 1, day);
    }

    private RentalUnit aUnitOf(Resort resort, UnitType type, double dailyPrice) {
        RentalUnit unit = aUnitIn(resort, dailyPrice);
        unit.setType(type);
        return rentalUnitRepository.save(unit);
    }

    private RentalUnit blocked(RentalUnit unit) {
        unit.setIsBlocked(true);
        return rentalUnitRepository.save(unit);
    }

    private void booked(RentalUnit unit, LocalDate start, LocalDate end, Status status) {
        aBooking(aClient(), unit, start, end, status, now());
    }

    private Resort aResortCalled(String name, String location) {
        Resort resort = aResort();
        resort.setName(name);
        resort.setLocation(location);
        return resortRepository.save(resort);
    }

    private Amenity anAmenity(String name) {
        return amenityRepository.save(new Amenity(null, name, null));
    }

    private void offers(Resort resort, Amenity... amenities) {
        resort.setAmenities(new ArrayList<>(List.of(amenities)));
        resortRepository.save(resort);
    }

    private ResultActions search(String query) throws Exception {
        syncWithDatabase();
        return mockMvc.perform(get("/api/resorts" + (query.isEmpty() ? "" : "?" + query)));
    }

    private ResultActions occupiedUnits(Resort resort, String query) throws Exception {
        syncWithDatabase();
        return mockMvc.perform(get("/api/resorts/" + resort.getIdResort() + "/occupied-units"
                + (query.isEmpty() ? "" : "?" + query)));
    }

    /** Los ids como los lee JsonPath, que trae los números chicos como {@code Integer}. */
    private static Integer[] ids(Resort... resorts) {
        return Arrays.stream(resorts).map(r -> r.getIdResort().intValue()).toArray(Integer[]::new);
    }

    private static Integer[] ids(RentalUnit... units) {
        return Arrays.stream(units).map(u -> u.getIdRentalUnit().intValue()).toArray(Integer[]::new);
    }

    // ---------------------------------------------------------------------
    // Sin filtros
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("sin filtros responde lo mismo que hoy: todos los activos, con lugar o sin él, y availableUnits en null")
    void withoutFilters_sameAsToday() throws Exception {
        Resort withRoom = aResort();
        aUnitIn(withRoom, 10_000.0);
        Resort full = aResort();
        booked(aUnitIn(full, 10_000.0), january(15), january(17), Status.CONFIRMED);
        Resort allBlocked = aResort();
        blocked(aUnitIn(allBlocked, 10_000.0));
        Resort withoutUnits = aResort();
        Resort inactive = aResort();
        inactive.setActive(false);
        resortRepository.save(inactive);

        search("")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].idResort",
                        containsInAnyOrder(ids(withRoom, full, allBlocked, withoutUnits))))
                .andExpect(jsonPath("$[*].availableUnits", everyItem(nullValue())));
    }

    // ---------------------------------------------------------------------
    // Fechas
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("con fechas, el balneario con todo ocupado no aparece y el que tiene una libre aparece con availableUnits 1")
    void withDates_onlyResortsWithAFreeUnit() throws Exception {
        Resort full = aResort();
        booked(aUnitIn(full, 10_000.0), january(15), january(17), Status.CONFIRMED);
        // Pendiente y de un solo día: igual ocupa, porque todavía se puede pagar.
        booked(aUnitIn(full, 10_000.0), january(16), january(16), Status.PENDING);
        Resort oneFree = aResort();
        booked(aUnitIn(oneFree, 10_000.0), january(13), january(15), Status.CONFIRMED);
        aUnitIn(oneFree, 10_000.0);

        search(DATES)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].idResort", containsInAnyOrder(ids(oneFree))))
                .andExpect(jsonPath("$[0].availableUnits").value(1));
    }

    @Test
    @DisplayName("una reserva cancelada, o que termina antes o empieza después, no ocupa; una que toca un extremo, sí")
    void canceledOrOutsideTheDates_doesNotOccupy() throws Exception {
        Resort resort = aResort();
        booked(aUnitIn(resort, 10_000.0), january(15), january(17), Status.CANCELED);
        booked(aUnitIn(resort, 10_000.0), january(12), january(14), Status.CONFIRMED);
        booked(aUnitIn(resort, 10_000.0), january(18), january(20), Status.CONFIRMED);
        // Empieza el último día buscado: los extremos cuentan, así que esta sí está ocupada.
        booked(aUnitIn(resort, 10_000.0), january(17), january(19), Status.CONFIRMED);

        search(DATES)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].idResort", containsInAnyOrder(ids(resort))))
                .andExpect(jsonPath("$[0].availableUnits").value(3));
    }

    @Test
    @DisplayName("una unidad bloqueada no cuenta, aunque esté libre")
    void blockedUnits_doNotCount() throws Exception {
        Resort onlyBlocked = aResort();
        blocked(aUnitIn(onlyBlocked, 10_000.0));
        Resort mixed = aResort();
        blocked(aUnitIn(mixed, 10_000.0));
        aUnitIn(mixed, 10_000.0);

        search(DATES)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].idResort", containsInAnyOrder(ids(mixed))))
                .andExpect(jsonPath("$[0].availableUnits").value(1));
    }

    @Test
    @DisplayName("un balneario desactivado no aparece, aunque tenga lugar")
    void inactiveResorts_doNotAppear() throws Exception {
        Resort active = aResort();
        aUnitIn(active, 10_000.0);
        Resort inactive = aResort();
        aUnitIn(inactive, 10_000.0);
        inactive.setActive(false);
        resortRepository.save(inactive);

        search(DATES)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].idResort", containsInAnyOrder(ids(active))));
    }

    @Test
    @DisplayName("hoy todavía se puede buscar")
    void today_isAccepted() throws Exception {
        Resort resort = aResort();
        aUnitIn(resort, 10_000.0);

        search("from=2026-01-10&to=2026-01-10")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].idResort", containsInAnyOrder(ids(resort))))
                .andExpect(jsonPath("$[0].availableUnits").value(1));
    }

    // ---------------------------------------------------------------------
    // Tipo, precio y servicios
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("type deja solo los que tienen una unidad de ese tipo sin bloquear; sin fechas, availableUnits es null")
    void type_leavesOnlyThoseWithThatType() throws Exception {
        Resort tents = aResort();
        aUnitOf(tents, UnitType.TENT, 20_000.0);
        aUnitOf(tents, UnitType.UMBRELLA, 8_000.0);
        Resort umbrellas = aResort();
        aUnitOf(umbrellas, UnitType.UMBRELLA, 8_000.0);
        Resort blockedTent = aResort();
        blocked(aUnitOf(blockedTent, UnitType.TENT, 20_000.0));
        aUnitOf(blockedTent, UnitType.UMBRELLA, 8_000.0);

        search("type=TENT")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].idResort", containsInAnyOrder(ids(tents))))
                .andExpect(jsonPath("$[0].availableUnits").value(nullValue()));
    }

    @Test
    @DisplayName("con type y fechas, cuenta solo las unidades de ese tipo que están libres")
    void typeAndDates_countOnlyFreeUnitsOfThatType() throws Exception {
        Resort resort = aResort();
        booked(aUnitOf(resort, UnitType.TENT, 20_000.0), january(15), january(17), Status.CONFIRMED);
        aUnitOf(resort, UnitType.UMBRELLA, 8_000.0);
        aUnitOf(resort, UnitType.UMBRELLA, 8_000.0);

        search("type=TENT&" + DATES)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
        search("type=UMBRELLA&" + DATES)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].idResort", containsInAnyOrder(ids(resort))))
                .andExpect(jsonPath("$[0].availableUnits").value(2));
    }

    @Test
    @DisplayName("maxPrice deja los que tienen una unidad a ese precio o menos, y cuenta solo esas")
    void maxPrice_leavesOnlyThoseAtOrBelowThePrice() throws Exception {
        Resort cheap = aResort();
        aUnitIn(cheap, 8_000.0);
        aUnitIn(cheap, 15_000.0);
        Resort exact = aResort();
        aUnitIn(exact, 10_000.0);
        Resort expensive = aResort();
        aUnitIn(expensive, 15_000.0);

        search("maxPrice=10000&" + DATES)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].idResort", containsInAnyOrder(ids(cheap, exact))))
                .andExpect(jsonPath("$[*].availableUnits", everyItem(is(1))));
    }

    @Test
    @DisplayName("amenityIds deja los que tienen todos esos servicios, no alguno")
    void amenityIds_leavesOnlyThoseWithAllOfThem() throws Exception {
        Amenity wifi = anAmenity("Wi-Fi");
        Amenity parking = anAmenity("Estacionamiento");
        Amenity showers = anAmenity("Duchas");
        Resort all = aResort();
        aUnitIn(all, 10_000.0);
        offers(all, wifi, parking, showers);
        Resort onlyWifi = aResort();
        aUnitIn(onlyWifi, 10_000.0);
        offers(onlyWifi, wifi);
        Resort none = aResort();
        aUnitIn(none, 10_000.0);

        search("amenityIds=" + wifi.getIdAmenity() + "," + parking.getIdAmenity())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].idResort", containsInAnyOrder(ids(all))));
        // También repitiendo el parámetro, que es como lo arma HttpParams de Angular.
        search("amenityIds=" + wifi.getIdAmenity() + "&amenityIds=" + parking.getIdAmenity())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].idResort", containsInAnyOrder(ids(all))));
        search("amenityIds=" + wifi.getIdAmenity())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].idResort", containsInAnyOrder(ids(all, onlyWifi))));
    }

    // ---------------------------------------------------------------------
    // Texto
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("q busca en el nombre o en la ubicación, sin distinguir mayúsculas")
    void q_matchesNameOrLocationIgnoringCase() throws Exception {
        Resort byName = aResortCalled("Playa Serena", "Necochea");
        aUnitIn(byName, 10_000.0);
        Resort byLocation = aResortCalled("La Caleta", "Playa Unión");
        aUnitIn(byLocation, 10_000.0);
        Resort other = aResortCalled("Costa Azul", "Pinamar");
        aUnitIn(other, 10_000.0);

        search("q=pLaYa")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].idResort", containsInAnyOrder(ids(byName, byLocation))))
                .andExpect(jsonPath("$[*].availableUnits", everyItem(nullValue())));
    }

    @Test
    @DisplayName("un % o un _ en q se buscan tal cual, no como comodines")
    void q_wildcardsAreLiteral() throws Exception {
        Resort withPercent = aResortCalled("Sol 100% Playa", "Necochea");
        aUnitIn(withPercent, 10_000.0);
        Resort withoutPercent = aResortCalled("Sol 1000 Playa", "Necochea");
        aUnitIn(withoutPercent, 10_000.0);
        Resort withUnderscore = aResortCalled("Mar_Azul", "Villa Gesell");
        aUnitIn(withUnderscore, 10_000.0);
        Resort withoutUnderscore = aResortCalled("Mar Azul", "Villa Gesell");
        aUnitIn(withoutUnderscore, 10_000.0);

        // Con param() y no armando la URL a mano: así el % llega tal cual, sin pensar en cómo se
        // codifica en la dirección.
        syncWithDatabase();
        mockMvc.perform(get("/api/resorts").param("q", "100%"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].idResort", containsInAnyOrder(ids(withPercent))));
        mockMvc.perform(get("/api/resorts").param("q", "mar_"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].idResort", containsInAnyOrder(ids(withUnderscore))));
    }

    // ---------------------------------------------------------------------
    // Unidades ocupadas
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("occupied-units, sin token, devuelve las unidades con reservas pendientes o confirmadas en esas fechas")
    void occupiedUnits_pendingAndConfirmedOnly() throws Exception {
        Resort resort = aResort();
        RentalUnit confirmed = aUnitIn(resort, 10_000.0);
        booked(confirmed, january(15), january(17), Status.CONFIRMED);
        RentalUnit pending = aUnitIn(resort, 10_000.0);
        booked(pending, january(17), january(18), Status.PENDING);
        RentalUnit twice = aUnitIn(resort, 10_000.0);
        booked(twice, january(15), january(15), Status.CONFIRMED);
        booked(twice, january(16), january(16), Status.PENDING);
        RentalUnit canceled = aUnitIn(resort, 10_000.0);
        booked(canceled, january(15), january(17), Status.CANCELED);
        RentalUnit later = aUnitIn(resort, 10_000.0);
        booked(later, january(18), january(20), Status.CONFIRMED);
        aUnitIn(resort, 10_000.0);
        // La misma fecha en otro balneario no cuenta.
        booked(aUnitIn(aResort(), 10_000.0), january(15), january(17), Status.CONFIRMED);

        occupiedUnits(resort, DATES)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", containsInAnyOrder(ids(confirmed, pending, twice))));
    }

    @Test
    @DisplayName("occupied-units de un balneario sin reservas devuelve la lista vacía")
    void occupiedUnits_emptyWhenNothingIsBooked() throws Exception {
        Resort resort = aResort();
        aUnitIn(resort, 10_000.0);

        occupiedUnits(resort, DATES)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    @DisplayName("occupied-units de un balneario que no existe: 404")
    void occupiedUnits_unknownResort_notFound() throws Exception {
        mockMvc.perform(get("/api/resorts/999999/occupied-units?" + DATES))
                .andExpect(status().isNotFound());
    }

    // ---------------------------------------------------------------------
    // Pedidos inválidos
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("buscar con fechas inválidas o un type que no existe: 400 con el motivo")
    void search_invalidParameters_badRequest() throws Exception {
        search("from=2026-01-17&to=2026-01-15")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error")
                        .value("La fecha from (2026-01-17) no puede ser posterior a to (2026-01-15)."));
        search("from=2026-01-09&to=2026-01-12")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("La fecha from (2026-01-09) ya pasó: hoy es 2026-01-10."));
        search("from=2026-01-15")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Van las dos fechas, from y to, o ninguna."));
        search("to=2026-01-17")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Van las dos fechas, from y to, o ninguna."));
        search("type=CARPA")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", containsString("type")));
        search("from=15/01/2026&to=17/01/2026")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", containsString("AAAA-MM-DD")));
    }

    @Test
    @DisplayName("occupied-units sin las dos fechas, o con fechas inválidas: 400 con el motivo")
    void occupiedUnits_invalidDates_badRequest() throws Exception {
        Resort resort = aResort();

        occupiedUnits(resort, "")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Van las dos fechas, from y to."));
        occupiedUnits(resort, "from=2026-01-15")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Van las dos fechas, from y to."));
        occupiedUnits(resort, "from=2026-01-17&to=2026-01-15")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error")
                        .value("La fecha from (2026-01-17) no puede ser posterior a to (2026-01-15)."));
        occupiedUnits(resort, "from=2026-01-09&to=2026-01-12")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("La fecha from (2026-01-09) ya pasó: hoy es 2026-01-10."));
    }

    @TestConfiguration
    static class FixedClock {
        @Bean
        @Primary
        Clock fixedClock() {
            // 10:00 del 10/01/2026 en Buenos Aires.
            return Clock.fixed(Instant.parse("2026-01-10T13:00:00Z"), TimeConfig.RESORT_ZONE);
        }
    }
}
