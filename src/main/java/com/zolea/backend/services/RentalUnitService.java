package com.zolea.backend.services;

import com.zolea.backend.dtos.rentalunit.RentalUnitRequest;
import com.zolea.backend.dtos.rentalunit.RentalUnitResponse;
import com.zolea.backend.exceptions.rentalunit.DuplicateIdentifierException;
import com.zolea.backend.exceptions.rentalunit.RentalUnitNotFoundException;
import com.zolea.backend.exceptions.rentalunit.RentalUnitRetiredException;
import com.zolea.backend.exceptions.resort.ResortNotFoundException;
import com.zolea.backend.models.Booking;
import com.zolea.backend.models.RentalUnit;
import com.zolea.backend.models.Resort;
import com.zolea.backend.repositories.BookingRepository;
import com.zolea.backend.repositories.RentalUnitRepository;
import com.zolea.backend.repositories.ResortRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

/**
 * <p><b>Transacciones:</b> la clase entera es de solo lectura y cada método que escribe lo declara.
 * Antes no había ninguna transacción declarada acá: el mapeo a DTO recorría colecciones LAZY fuera
 * de toda transacción y funcionaba únicamente porque {@code spring.jpa.open-in-view} dejaba la
 * sesión de base abierta durante toda la petición. Es decir, la transacción existía pero no la
 * había decidido nadie, y su límite lo ponía un filtro web.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class RentalUnitService {

    private final RentalUnitRepository rentalUnitRepository;
    private final ResortRepository resortRepository;
    private final BookingRepository bookingRepository;
    private final Clock clock;

    @Transactional
    public RentalUnitResponse createRentalUnit(RentalUnitRequest request) {
        Resort resort = resortRepository.findById(request.resortId())
                .orElseThrow(() -> new ResortNotFoundException(
                        "Balneario no encontrado con el ID: " + request.resortId()));

        // El identificador tiene que ser único dentro del balneario. Además de la restricción en la
        // base, se comprueba acá para poder devolver un mensaje que diga qué pasó. Las unidades
        // dadas de baja cuentan: su identificador sigue ocupado.
        boolean repetido = rentalUnitRepository.findByResort_IdResort(request.resortId()).stream()
                .anyMatch(u -> u.getIdentifier().equalsIgnoreCase(request.identifier()));
        if (repetido) {
            throw new DuplicateIdentifierException(
                    "Ya existe una unidad con el identificador " + request.identifier()
                            + " en este balneario.");
        }

        RentalUnit unit = new RentalUnit();
        unit.setType(request.type());
        unit.setIdentifier(request.identifier());
        unit.setDailyPrice(request.dailyPrice().setScale(Booking.MONEY_SCALE, RoundingMode.HALF_UP));
        unit.setIsBlocked(request.isBlocked() != null ? request.isBlocked() : false);
        unit.setResort(resort);

        return mapToResponse(rentalUnitRepository.save(unit));
    }

    /**
     * Las unidades de un balneario, o todas si no se indica ninguno.
     *
     * <p>El {@code null} es para los clientes: el filtrado por dueño lo decide el endpoint, que es
     * quien conoce al usuario. El administrador ve también las dadas de baja, con {@code retired} en
     * true; un cliente no, porque ya no se ofrecen (RF32).
     */
    public List<RentalUnitResponse> getAllRentalUnits(Long idResort) {
        List<RentalUnit> units = idResort != null
                ? rentalUnitRepository.findByResort_IdResort(idResort)
                : rentalUnitRepository.findAll().stream().filter(u -> !u.isRetired()).toList();
        return units.stream()
                .map(this::mapToResponse)
                .toList();
    }

    @Transactional
    public RentalUnitResponse updatePrice(Long idRentalUnit, BigDecimal newPrice) {
        RentalUnit unit = rentalUnitRepository.findById(idRentalUnit)
                .orElseThrow(() -> new RentalUnitNotFoundException(
                        "Unidad no encontrada con el ID: " + idRentalUnit));
        unit.requireInService();

        // Se normaliza la escala al entrar: si no, ?newPrice=8500 queda guardado sin centavos y
        // el mismo importe sale escrito de dos formas distintas según cómo se haya cargado.
        unit.setDailyPrice(newPrice.setScale(Booking.MONEY_SCALE, RoundingMode.HALF_UP));
        return mapToResponse(rentalUnitRepository.save(unit));
    }

    @Transactional
    public RentalUnitResponse updateBlockStatus(Long idRentalUnit, Boolean isBlocked) {
        RentalUnit unit = rentalUnitRepository.findById(idRentalUnit)
                .orElseThrow(() -> new RentalUnitNotFoundException(
                        "Unidad no encontrada con el ID: " + idRentalUnit));
        unit.requireInService();

        unit.setIsBlocked(isBlocked);
        return mapToResponse(rentalUnitRepository.save(unit));
    }

    /**
     * Da de baja la unidad (RF32). Es definitivo y distinto del bloqueo, que es temporal: la unidad
     * deja de ofrecerse y de poder reservarse, pero la fila queda, con sus reservas pasadas y su
     * identificador ocupado.
     *
     * <p>No se puede mientras tenga reservas por delante —pendientes o confirmadas que terminan hoy
     * o después—: quedarían apuntando a una unidad que ya no se ofrece. Darla de baja otra vez no
     * hace nada.
     *
     * <p>Toma el candado sobre la unidad, el mismo que toma la reserva: así no entra una reserva
     * nueva entre que se mira si tiene reservas por delante y se la da de baja.
     *
     * @throws RentalUnitNotFoundException si la unidad no existe.
     * @throws RentalUnitRetiredException  si tiene reservas por delante.
     */
    @Transactional
    public RentalUnitResponse retire(Long idRentalUnit) {
        RentalUnit unit = rentalUnitRepository.findByIdForUpdate(idRentalUnit)
                .orElseThrow(() -> new RentalUnitNotFoundException(
                        "Unidad no encontrada con el ID: " + idRentalUnit));
        if (unit.isRetired()) {
            return mapToResponse(unit);
        }
        if (bookingRepository.hasUpcomingBookings(idRentalUnit, LocalDate.now(clock))) {
            throw new RentalUnitRetiredException(
                    "Tiene reservas por delante: cancelalas o esperá a que terminen.");
        }
        unit.setRetired(true);
        return mapToResponse(rentalUnitRepository.save(unit));
    }

    // MAPPER interno: Convierte la entidad de BD al DTO limpio
    private RentalUnitResponse mapToResponse(RentalUnit unit) {
        return new RentalUnitResponse(
                unit.getIdRentalUnit(),
                unit.getType(),
                unit.getIdentifier(),
                unit.getDailyPrice(),
                unit.getIsBlocked(),
                unit.getResort() != null ? unit.getResort().getIdResort() : null,
                unit.isRetired()
        );
    }
}