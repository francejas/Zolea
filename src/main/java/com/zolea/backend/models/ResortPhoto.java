package com.zolea.backend.models;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;

/**
 * Una foto del balneario, subida desde Mi balneario (GH-67).
 *
 * <p>La imagen se guarda en la base, junto con su tipo: es lo más simple de desplegar (no hay
 * carpeta ni servicio aparte que respaldar) y las fotos son pocas, hasta {@link #MAX_PER_RESORT}
 * por balneario y de {@link #MAX_BYTES} como máximo.
 *
 * <p>El listado de balnearios nunca carga esta entidad: lee los ids con una proyección
 * ({@code ResortPhotoRepository#findRefsByResortIds}), así una portada con diez balnearios no trae
 * cincuenta megas de imágenes que no va a mostrar. Ordenar y borrar tampoco la cargan.
 *
 * <p>{@code position} da el orden; la primera es la portada. No tiene que ser correlativa: borrar
 * una deja un hueco, y el orden sigue siendo el mismo.
 */
@Entity
@Table(name = "resort_photo")
@Data
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class ResortPhoto {

    /** Cuántas fotos puede tener un balneario. */
    public static final int MAX_PER_RESORT = 10;

    /** Lo que puede pesar cada foto: 5 MB. */
    public static final long MAX_BYTES = 5L * 1024 * 1024;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Long idPhoto;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_resort", nullable = false)
    @ToString.Exclude
    private Resort resort;

    /** {@code image/jpeg}, {@code image/png} o {@code image/webp}, según lo que es el archivo. */
    @Column(nullable = false, length = 20)
    private String contentType;

    // MEDIUMBLOB llega a 16 MB: entra una foto de 5 MB con margen. Se dice a mano para no depender
    // de qué tipo elige Hibernate para un @Lob en MySQL.
    @Lob
    @Column(nullable = false, columnDefinition = "MEDIUMBLOB")
    @ToString.Exclude
    private byte[] data;

    @Column(nullable = false)
    private int position;
}
