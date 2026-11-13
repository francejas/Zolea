package com.zolea.backend.exceptions;

import com.zolea.backend.exceptions.amenity.AmenityNotFoundException;
import com.zolea.backend.exceptions.amenity.InvalidAmenityException;
import com.zolea.backend.exceptions.auth.InvalidCredentialsException;
import com.zolea.backend.exceptions.booking.BookingAlreadyCanceledException;
import com.zolea.backend.exceptions.booking.BookingForbiddenException;
import com.zolea.backend.exceptions.booking.BookingNotFoundException;
import com.zolea.backend.exceptions.booking.UnitNotAvailableException;
import com.zolea.backend.exceptions.client.ClientInvalidRegisterException;
import com.zolea.backend.exceptions.client.ClientNotFoundException;
import com.zolea.backend.exceptions.guest.BookingNotInValidPeriodException;
import com.zolea.backend.exceptions.guest.BookingNotPaidException;
import com.zolea.backend.exceptions.guest.GuestAlreadyEnteredException;
import com.zolea.backend.exceptions.guest.GuestNotFoundException;
import com.zolea.backend.exceptions.booking.BookingStateException;
import com.zolea.backend.exceptions.booking.InvalidBookingRangeException;
import com.zolea.backend.exceptions.payment.PaymentGatewayException;
import com.zolea.backend.exceptions.rentalunit.DuplicateIdentifierException;
import com.zolea.backend.exceptions.rentalunit.RentalUnitNotFoundException;
import com.zolea.backend.exceptions.rentalunit.RentalUnitRetiredException;
import com.zolea.backend.exceptions.resort.ResortInvalidRegisterException;
import com.zolea.backend.exceptions.resort.ResortNotFoundException;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.validation.ObjectError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Traduce las excepciones del dominio al código HTTP que les corresponde.
 *
 * <p>Todas las respuestas mantienen la misma forma —{@code {"error": "..."}}— porque es la que lee
 * el frontend. Por eso este manejador NO extiende {@code ResponseEntityExceptionHandler}: hacerlo
 * cambiaría el cuerpo de los errores de Spring MVC a {@code ProblemDetail} y rompería los mensajes
 * de la interfaz. Se reevalúa al incorporar Bean Validation, que necesita una forma propia para los
 * errores de campo.
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static ResponseEntity<Map<String, String>> respuesta(HttpStatus status, String mensaje) {
        return ResponseEntity.status(status).body(Map.of("error", mensaje));
    }

    @ExceptionHandler({
            ClientNotFoundException.class,
            GuestNotFoundException.class,
            ResortNotFoundException.class,
            AmenityNotFoundException.class,
            BookingNotFoundException.class,
            RentalUnitNotFoundException.class
    })
    public ResponseEntity<Map<String, String>> handleNotFound(RuntimeException ex) {
        return respuesta(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler({
            UnitNotAvailableException.class,
            InvalidAmenityException.class,
            BookingNotPaidException.class,
            BookingNotInValidPeriodException.class,
            GuestAlreadyEnteredException.class,
            ClientInvalidRegisterException.class,
            ResortInvalidRegisterException.class,
            BookingAlreadyCanceledException.class,
            DuplicateIdentifierException.class,
            InvalidBookingRangeException.class,
            BookingStateException.class,
            RentalUnitRetiredException.class
    })
    public ResponseEntity<Map<String, String>> handleBadRequest(RuntimeException ex) {
        return respuesta(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    @ExceptionHandler(BookingForbiddenException.class)
    public ResponseEntity<Map<String, String>> handleForbidden(BookingForbiddenException ex) {
        return respuesta(HttpStatus.FORBIDDEN, ex.getMessage());
    }

    /**
     * El 403 de {@code @PreAuthorize}.
     *
     * <p>Sin este manejador la excepción caía en el genérico de más abajo y salía como 500, así que
     * el único control de autorización del sistema parecía estar roto. Tiene que estar declarado
     * explícitamente: {@code @RestControllerAdvice} atiende la excepción antes de que llegue al
     * {@code ExceptionTranslationFilter} de Spring Security, que es quien normalmente la traduce.
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, String>> handleAccessDenied(AccessDeniedException ex) {
        return respuesta(HttpStatus.FORBIDDEN, "No tenés permiso para realizar esta operación");
    }

    /**
     * Los errores de validación de entrada: campos obligatorios que faltan, formatos inválidos.
     *
     * <p>Devuelve el mismo {@code error} de siempre —que es lo que muestra el frontend— y agrega un
     * mapa {@code campos} con el detalle por campo, para que un formulario pueda marcar cuál está
     * mal en lugar de mostrar un cartel genérico.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidacion(MethodArgumentNotValidException ex) {
        Map<String, String> campos = new LinkedHashMap<>();
        for (FieldError error : ex.getBindingResult().getFieldErrors()) {
            campos.putIfAbsent(error.getField(), error.getDefaultMessage());
        }
        // Las restricciones de clase entera —como @HolderRequired— no tienen campo asociado.
        for (ObjectError error : ex.getBindingResult().getGlobalErrors()) {
            campos.putIfAbsent(error.getObjectName(), error.getDefaultMessage());
        }
        return ResponseEntity.badRequest()
                .body(Map.of("error", "Hay datos inválidos en el pedido", "campos", campos));
    }

    /** Lo mismo, para las anotaciones puestas sobre parámetros sueltos de la URL. */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<Map<String, String>> handleParametroInvalido(ConstraintViolationException ex) {
        String detalle = ex.getConstraintViolations().stream()
                .map(ConstraintViolation::getMessage)
                .findFirst()
                .orElse("Parámetro inválido");
        return respuesta(HttpStatus.BAD_REQUEST, detalle);
    }

    /**
     * Un parámetro de la URL que no se puede convertir a su tipo, como {@code from=ayer} donde va una
     * fecha. Sin esto caía en el manejo general y respondía 500, cuando el error es del pedido.
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, String>> handleTipoInvalido(MethodArgumentTypeMismatchException ex) {
        String formato = LocalDate.class.equals(ex.getRequiredType()) ? " Va con el formato AAAA-MM-DD." : "";
        return respuesta(HttpStatus.BAD_REQUEST,
                "El parámetro " + ex.getName() + " no es válido: " + ex.getValue() + "." + formato);
    }

    /**
     * Una restricción de la base que se violó.
     *
     * <p>Devuelve <b>409</b> y no 400, y la diferencia es informativa: un 400 significa que una
     * regla del sistema rechazó el pedido; un 409 significa que el pedido era válido cuando se
     * comprobó y dejó de serlo al guardar, que es lo que pasa cuando dos peticiones simultáneas
     * pasan las dos el chequeo previo. Sin este manejador salía 500.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>> handleConflicto(DataIntegrityViolationException ex) {
        log.warn("Restricción de la base violada al guardar", ex);
        return respuesta(HttpStatus.CONFLICT,
                "El dato que intentás guardar ya existe o entra en conflicto con otro.");
    }

    @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<Map<String, String>> handleUnauthorized(InvalidCredentialsException ex) {
        return respuesta(HttpStatus.UNAUTHORIZED, ex.getMessage());
    }

    /**
     * Red por si una excepción de autenticación de Spring se escapa por otro camino.
     *
     * <p>{@code AuthService} ya las traduce al iniciar sesión, pero sin este manejador cualquier
     * otra caería en el genérico y saldría como 500. El mensaje es fijo a propósito: el motivo
     * exacto —usuario inexistente, contraseña incorrecta, cuenta deshabilitada— es justamente lo
     * que no conviene contarle a quien no pudo autenticarse.
     */
    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<Map<String, String>> handleAuthentication(AuthenticationException ex) {
        log.debug("Autenticación rechazada: {}", ex.getMessage());
        return respuesta(HttpStatus.UNAUTHORIZED, "Email o contraseña incorrectos.");
    }

    /** Falla del proveedor de pagos: el problema no es del cliente, pero tampoco es nuestro. */
    @ExceptionHandler(PaymentGatewayException.class)
    public ResponseEntity<Map<String, String>> handlePaymentGateway(PaymentGatewayException ex) {
        log.error("Falla del proveedor de pagos", ex);
        return respuesta(HttpStatus.BAD_GATEWAY, ex.getMessage());
    }

    /**
     * Red de contención. Lo que llega acá es un error que nadie previó, así que se registra con la
     * excepción completa: es la única traza que queda de un fallo en producción. Al cliente se le
     * devuelve un mensaje genérico, sin detalle interno.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleGeneric(Exception ex) {
        log.error("Error no previsto atendiendo la petición", ex);
        return respuesta(HttpStatus.INTERNAL_SERVER_ERROR, "Error interno del servidor");
    }
}
