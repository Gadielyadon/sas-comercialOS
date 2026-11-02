/* ════════════════════════════════════════════════════════════════
   AxSoft · Base de conocimiento del Asistente de ayuda
   ────────────────────────────────────────────────────────────────
   ESTE ES EL ARCHIVO QUE VOS EDITÁS para enseñarle cosas al bot.
   Cada entrada tiene:
     id     : nombre único (sin espacios)
     modulo : en qué pantalla aplica (se usa para dar prioridad según
              dónde esté el usuario)
     q      : la pregunta tal como la muestra el bot (también se busca ahí)
     kw     : palabras clave / sinónimos que la gente usaría (sin tildes da igual)
     a      : la respuesta. Se puede usar <b>negrita</b> y <br>
     link   : (opcional) [texto, ruta] botón para ir a esa pantalla
   Para agregar una pregunta nueva: copiá una entrada, pegala y cambiá los textos.
   ════════════════════════════════════════════════════════════════ */
window.AX_AYUDA = {

  /* Qué módulo es cada ruta (para dar contexto) */
  rutas: [
    ['/ventas', 'ventas'], ['/historial', 'historial'], ['/reportes', 'reportes'],
    ['/caja', 'caja'], ['/clientes', 'clientes'], ['/presupuestos', 'presupuestos'],
    ['/remitos', 'remitos'], ['/inventario', 'inventario'], ['/stock', 'stock'],
    ['/vencimientos', 'vencimientos'], ['/proveedores', 'proveedores'],
    ['/pedidos', 'pedidos'], ['/gastos', 'gastos'], ['/importar', 'importar'],
    ['/sucursales', 'sucursales'], ['/afip', 'afip'], ['/auditoria', 'auditoria'],
    ['/catalogo', 'catalogo'], ['/ajustes', 'ajustes'], ['/dashboard', 'general']
  ],

  nombresModulo: {
    ventas: 'Punto de venta', historial: 'Historial', reportes: 'Reportes', caja: 'Caja',
    clientes: 'Clientes', presupuestos: 'Presupuestos', remitos: 'Remitos',
    inventario: 'Inventario', stock: 'Stock', vencimientos: 'Vencimientos',
    proveedores: 'Proveedores', pedidos: 'Pedidos', gastos: 'Gastos', importar: 'Importar',
    sucursales: 'Sucursales', afip: 'Facturación AFIP', auditoria: 'Auditoría',
    catalogo: 'Catálogo', ajustes: 'Ajustes', general: 'General'
  },

  /* Sugerencias iniciales por módulo (ids de entradas) */
  sugeridas: {
    ventas:        ['v-cobrar', 'v-atajos', 'v-espera'],
    historial:     ['h-buscar', 'v-anular', 'h-facturar'],
    reportes:      ['r-ver', 'r-descuentos', 'r-metodos'],
    caja:          ['c-abrir', 'c-cerrar', 'c-movimiento'],
    clientes:      ['cl-nuevo', 'cl-pago', 'cl-whatsapp'],
    presupuestos:  ['p-crear', 'p-estados', 'p-a-venta'],
    remitos:       ['rm-crear', 'rm-estados'],
    inventario:    ['i-producto', 'i-editar', 'i-importar'],
    stock:         ['s-ajustar', 's-faltantes', 's-hay'],
    vencimientos:  ['ven-cargar', 'ven-estados', 'ven-baja'],
    proveedores:   ['pr-recepcion', 'pr-pagar', 'pr-deuda'],
    pedidos:       ['ped-nuevo', 'ped-enviar', 'ped-faltantes'],
    gastos:        ['g-cargar', 'g-pagar', 'g-categoria'],
    importar:      ['imp-como', 'imp-avisos', 'imp-error'],
    sucursales:    ['su-cambiar', 'su-nueva', 'su-eliminar'],
    afip:          ['af-factura', 'af-historial', 'af-error'],
    auditoria:    ['au-ver', 'au-control', 'au-rentabilidad'],
    catalogo:     ['ca-vidriera', 'ca-origen', 'ca-producto'],
    ajustes:       ['aj-usuario', 'aj-metodos', 'aj-backup'],
    general:       ['gen-permiso', 'gen-offline', 'gen-sesion']
  },

  items: [

    /* ───────── GENERAL ───────── */
    { id: 'gen-permiso', modulo: 'general',
      q: 'No me deja entrar a una sección / me dice "Acceso denegado"',
      kw: ['acceso denegado', 'no puedo entrar', '403', 'permiso', 'no aparece', 'no veo el menu', 'sin acceso', 'bloqueado', 'no veo', 'no me aparece la seccion'],
      a: 'Cada empleado solo ve las secciones que el administrador le habilitó. Si necesitás una que no ves, pedile al <b>administrador</b> que te la active en <b>Ajustes → Usuarios</b>.<br>Lo mismo pasa con las acciones sensibles (<b>anular ventas</b>, <b>ver costos y márgenes</b>, <b>dar descuentos</b>): se habilitan por separado, una por una.<br>Y <b>Sucursales, Facturación AFIP, Auditoría, Catálogo y Ajustes</b> son solo para administradores.' },

    { id: 'gen-sesion', modulo: 'general',
      q: 'Me sacó del sistema / me pide iniciar sesión de nuevo',
      kw: ['sesion', 'vencio', 'me saco', 'login', 'iniciar sesion', 'desconecto', 'volver a entrar', 'cerrar sesion'],
      a: 'Por seguridad, la sesión <b>vence todos los días a las 00:00</b> (hora Argentina). A la mañana hay que volver a iniciar sesión.<br>Si te pasa en medio del día, puede ser que se haya reiniciado el servidor o que hayas iniciado sesión en otro equipo. Entrá de nuevo y listo. Para salir a propósito, usá el botón de <b>cerrar sesión</b> abajo en el menú.' },

    { id: 'gen-offline', modulo: 'general',
      q: '¿Qué pasa si se corta internet?',
      kw: ['internet', 'sin internet', 'offline', 'se cayo', 'sin conexion', 'wifi', 'se corto', 'no hay senal', 'sin red'],
      a: 'El sistema tiene <b>modo sin internet</b> para <b>Punto de venta, Stock e Inventario</b>: guarda esas pantallas y los datos en el equipo y podés seguir vendiendo. Cuando vuelve la conexión, las operaciones se sincronizan solas.<br>Para que funcione, la pantalla tiene que haberse abierto antes <i>con internet</i> en ese equipo. El resto de las secciones sí necesitan conexión.' },

    { id: 'gen-celular', modulo: 'general',
      q: '¿Puedo usarlo desde el celular? ¿Cómo lo instalo?',
      kw: ['celular', 'telefono', 'movil', 'android', 'iphone', 'app', 'instalar', 'pantalla de inicio', 'tablet'],
      a: 'Sí. Abrí el sistema desde el navegador del celular y elegí <b>"Agregar a pantalla de inicio"</b> (Chrome: menú ⋮ · Safari: botón compartir). Queda como una app con su ícono.<br>En las tablas anchas, <b>deslizá hacia los costados</b> para ver todas las columnas.' },

    { id: 'gen-notif', modulo: 'general',
      q: '¿Qué es la campanita de arriba?',
      kw: ['campana', 'campanita', 'notificacion', 'aviso', 'alerta', 'novedades'],
      a: 'La campanita muestra <b>avisos del sistema</b> (novedades, alertas, etc.). Tocala para verlos y desde ahí ir directo a lo que corresponda. En <b>Novedades</b> ves todo lo nuevo que se fue agregando al sistema.',
      link: ['Ver novedades', '/novedades'] },

    { id: 'gen-traba', modulo: 'general',
      q: 'El sistema se trabó / no carga / no anda',
      kw: ['se trabo', 'trabado', 'lento', 'se congelo', 'no carga', 'pantalla en blanco', 'no anda', 'no funciona', 'error raro', 'se colgo', 'no responde el sistema', 'tarda mucho'],
      a: 'Probá en este orden:<br>1. <b>Recargá la página</b> (en la computadora: Ctrl + F5; en el celular, deslizá hacia abajo).<br>2. Revisá que tengas <b>internet</b>.<br>3. Cerrá sesión y volvé a entrar.<br>Si sigue igual, avisale al <b>administrador</b> o a soporte contando qué estabas haciendo y qué mensaje apareció (si podés, sacale una captura).' },

    { id: 'gen-soporte', modulo: 'general',
      q: 'Necesito hablar con una persona / soporte',
      kw: ['soporte', 'hablar con alguien', 'hablar con una persona', 'persona', 'contacto', 'telefono de soporte', 'whatsapp soporte', 'ayuda humana', 'consultar con alguien', 'reclamo'],
      a: 'Si no pudiste resolverlo con este asistente, consultá al <b>administrador de tu comercio</b> o al <b>soporte de AxSoft</b>. <!-- COMPLETAR: agregá acá tu WhatsApp / teléfono / mail de soporte -->' },

    { id: 'gen-precio-formato', modulo: 'general',
      q: '¿Cómo escribo los precios? ¿Con punto o con coma?',
      kw: ['coma', 'punto', 'decimal', 'formato', 'precio', 'numero', 'centavos', 'miles'],
      a: 'Usá <b>coma para los centavos</b> (ej: <b>1500,50</b>). Al salir del campo, el sistema le agrega el punto de miles solo (1.500,50). Si escribís el número sin separadores también funciona.' },

    /* ───────── PUNTO DE VENTA ───────── */
    { id: 'v-sin-stock', modulo: 'ventas',
      q: 'No me deja vender un producto / dice que no hay stock',
      kw: ['sin stock', 'no hay stock', 'stock negativo', 'no deja vender', 'no aparece producto', 'agotado', 'no encuentra producto', 'no me aparece'],
      a: 'Revisá estas tres cosas:<br>• El producto debe estar <b>cargado en Inventario</b> y activo.<br>• Tiene que tener <b>stock</b> en la sucursal donde estás parado (fijate la sucursal arriba a la derecha).<br>• Probá buscarlo por código en vez de por nombre.<br>Si el stock real no coincide, corregilo desde <b>Stock → Ajustar</b>.' },

    /* ───────── PUNTO DE VENTA (detallado, según la pantalla real) ───────── */
    { id: 'v-cobrar', modulo: 'ventas',
      q: '¿Cómo hago una venta?',
      kw: ['hago una venta', 'hacer una venta', 'realizar una venta', 'cargar una venta', 'registrar una venta', 'como se vende', 'vender', 'venta', 'cobrar', 'nueva venta', 'registrar venta', 'finalizar venta', 'cobro', 'hacer una venta', 'agregar al carrito', 'como vendo', 'ticket'],
      a: '1. Entrá a <b>Punto de venta</b>.<br>2. Agregá los productos: <b>escaneá el código</b> o escribí el nombre en el buscador ("Escaneá código o buscá por nombre…") y elegilo; o tocá el producto en el catálogo.<br>3. En el carrito podés cambiar la cantidad (tocá el número) o el precio (tocá el precio unitario).<br>4. Si querés, elegí el <b>Cliente</b> (si no, queda "Consumidor Final") y aplicá un <b>Descuento</b>.<br>5. Tocá <b>Finalizar Venta</b> (o apretá <b>Enter</b> con el buscador vacío, o <b>F10</b>).<br>6. En la ventana de cobro elegí el <b>medio de pago</b> y tocá <b>Cobrar</b>.<br>7. Aparece <b>¡Venta Confirmada!</b>: imprimí el ticket (<b>F5</b>) y tocá <b>Nueva Venta</b> (<b>Enter</b>).<br><br>Para vender <b>no hace falta tener la caja abierta</b>, pero conviene abrirla para que el cierre de caja cuadre (preguntame "¿Cómo abro la caja?").',
      link: ['Ir al Punto de venta', '/ventas'] },

    { id: 'v-atajos', modulo: 'ventas',
      q: '¿Qué atajos de teclado tiene el punto de venta?',
      kw: ['atajos', 'teclas', 'teclado', 'f2', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'enter', 'rapido', 'shortcuts', 'combinaciones'],
      a: '<b>F2</b>: vuelve al buscador / escáner.<br><b>F5</b>: abre los Departamentos (y en la pantalla de "Venta Confirmada" imprime el ticket).<br><b>F6</b>: cambia la lista de precios (Minorista / Mayorista / Tarjeta).<br><b>F7</b>: pone la venta actual en espera y abre otra.<br><b>F8</b>: pasa a la siguiente venta en espera.<br><b>Alt + 1…9</b>: salta a esa venta en espera.<br><b>F9</b>: verificador de precios.<br><b>F10</b> o <b>Enter</b> (con el buscador vacío): cobrar.<br>En la ventana de cobro: flechas para moverte entre medios de pago, <b>Enter</b> para elegir uno, y <b>Enter</b> de nuevo para confirmar.' },

    { id: 'v-espera', modulo: 'ventas',
      q: '¿Cómo dejo una venta en espera para atender a otro cliente?',
      kw: ['venta en espera', 'en espera', 'dejar en espera', 'pausar venta', 'atender a otro', 'varias ventas', 'ventas en curso', 'guardar venta', 'otra venta a la vez', 'f7', 'dos clientes'],
      a: 'Tocá <b>F7 — Ventas en espera</b> (o el botón en pantalla) y elegí <b>Nueva venta en espera</b>: la venta actual queda guardada con sus productos y abrís una nueva. Para volver: <b>F8</b> pasa a la siguiente, o <b>Alt + 1…9</b> salta a una en particular. En la lista de <b>Ventas en curso</b> ves cuántos ítems y cuánto lleva cada una, y podés <b>Descartar</b> las que no sigan. Al cobrar una, se cierra y pasás a la siguiente.' },

    { id: 'v-cliente', modulo: 'ventas',
      q: '¿Cómo le asigno un cliente a la venta o creo uno nuevo?',
      kw: ['cliente', 'asignar cliente', 'agregar cliente', 'elegir cliente', 'a nombre de', 'consumidor final', 'buscar cliente', 'crear cliente rapido', 'cliente nuevo en la venta', 'cambiar cliente'],
      a: 'En el carrito, en <b>Cliente</b> (dice "Consumidor Final"), tocá el campo: se abre el buscador. Escribí <b>nombre, DNI/CUIT o teléfono</b> y elegilo.<br>Si no existe, tocá el botón <b>Nuevo cliente</b> y completá <b>Nombre</b> (obligatorio) y, si querés, DNI/CUIT y teléfono. Queda guardado y asignado a la venta.<br>El cliente es obligatorio para cobrar en <b>Cuenta corriente (fiado)</b>.' },

    { id: 'v-descuento', modulo: 'ventas',
      q: '¿Cómo aplico un descuento?',
      kw: ['descuento', 'rebaja', 'bonificacion', 'porcentaje', 'precio especial', 'hacer descuento', 'descontar', 'dar descuento', 'rebajar', 'quitar plata'],
      a: 'En el carrito, en la sección <b>Descuento</b>, elegí si es en <b>%</b> o en <b>$</b> (monto fijo) y escribí el valor. El <b>Subtotal</b>, el <b>Descuento</b> y el <b>TOTAL</b> se actualizan solos.<br>Para cambiarle el precio a un solo producto, tocá su <b>precio unitario</b> en el carrito.<br>Si te aparece el mensaje <i>"No tenés permiso para aplicar descuentos"</i>, pedile al administrador que te habilite la acción en <b>Ajustes → Usuarios</b>.' },

    { id: 'v-precioitem', modulo: 'ventas',
      q: '¿Cómo cambio el precio o la cantidad de un producto en el carrito?',
      kw: ['cambiar precio carrito', 'modificar precio', 'editar precio', 'precio manual', 'cambiar cantidad', 'sacar producto', 'quitar producto', 'eliminar del carrito', 'cantidad', 'mas unidades', 'menos unidades'],
      a: 'En el carrito, cada producto tiene:<br>• Botones <b>−</b> y <b>+</b> para sumar o restar de a una unidad.<br>• Tocá el <b>número de cantidad</b> para escribir una cantidad exacta (se abre un teclado).<br>• Tocá el <b>precio unitario</b> para modificar el precio solo de esa venta.<br>• El <b>tacho 🗑️</b> lo saca del carrito.<br>Para vaciar todo, tocá <b>Limpiar</b>.' },

    { id: 'v-lista', modulo: 'ventas',
      q: '¿Cómo vendo a precio mayorista o con precio de tarjeta?',
      kw: ['lista de precios', 'precio mayorista', 'precio tarjeta', 'minorista', 'cambiar lista', 'f6', 'vender mayorista', 'precio de lista', 'lista tarjeta'],
      a: 'Arriba, en el botón <b>F6 — Lista de precio</b> (dice "Minorista"), elegí <b>Minorista</b>, <b>Mayorista</b> o <b>Tarjeta</b>. También podés ir rotando con la tecla <b>F6</b>. Los precios del catálogo y del carrito pasan a esa lista.<br>Los productos que no tengan precio mayorista o de tarjeta cargado usan el minorista (se cargan en Inventario).' },

    { id: 'v-deptos', modulo: 'ventas',
      q: '¿Cómo cobro algo que no tiene código ni está cargado (Departamentos)?',
      kw: ['departamento', 'departamentos', 'ingreso manual', 'precio manual', 'sin codigo', 'producto no cargado', 'f5', 'rubro', 'panaderia', 'fiambreria', 'sin producto', 'vender sin cargar'],
      a: 'Usá los <b>Departamentos</b> (botón o tecla <b>F5</b>): elegís el departamento (ej: Panadería, Fiambrería), escribís el <b>Precio</b> y la <b>Cantidad</b>, y tocás <b>Agregar al carrito</b>. Sirve para vender sin tener el producto cargado.<br>Para crear o borrar departamentos tocá <b>Gestionar departamentos</b>: ponés un ícono y el nombre y lo agregás.' },

    { id: 'v-precios9', modulo: 'ventas',
      q: '¿Cómo consulto el precio de un producto sin venderlo?',
      kw: ['verificador de precios', 'consultar precio', 'cuanto sale', 'ver precio', 'f9', 'cuanto cuesta', 'precio de un producto', 'chequear precio'],
      a: 'Apretá <b>F9</b> para abrir el <b>verificador de precios</b>: escaneá el código o buscá el producto y te muestra el precio sin agregarlo al carrito.' },

    { id: 'v-vendedor', modulo: 'ventas',
      q: '¿Cómo cambio quién está atendiendo (vendedor)?',
      kw: ['vendedor', 'quien atiende', 'cambiar vendedor', 'pin', 'empleado atendiendo', 'cajero', 'atendiendo', 'comision', 'turno de empleado', 'cambiar de usuario'],
      a: 'Arriba en el Punto de venta tocá el recuadro con el nombre de quien está <b>atendiendo</b>. Elegí al empleado en la lista, escribí su <b>PIN</b> y tocá <b>Confirmar</b>. Cada venta queda registrada a nombre del vendedor activo. Si el PIN es incorrecto, te avisa. El PIN lo define el administrador.' },

    { id: 'v-mixto', modulo: 'ventas',
      q: '¿Cómo cobro con dos medios de pago (pago mixto)?',
      kw: ['mixto', 'pago mixto', 'dos metodos', 'pago combinado', 'efectivo y tarjeta', 'pago dividido', 'parte efectivo', 'varios medios', 'pago parcial', 'dos medios', 'segundo medio', 'mitad y mitad'],
      a: 'En la ventana de cobro tocá <b>Pago mixto → Activar</b>.<br>1. Elegí el primer medio de pago y poné cuánto paga con ese en <b>Monto en [medio]</b>.<br>2. Elegí el <b>Segundo medio</b>.<br>3. <b>Monto restante</b> se calcula solo.<br>4. Tocá <b>Cobrar</b>.<br>Por ejemplo: $10.000 en efectivo y el resto con tarjeta o transferencia.' },

    { id: 'v-recargo', modulo: 'ventas',
      q: '¿Cómo le cobro un recargo por pagar con tarjeta?',
      kw: ['recargo', 'recargo tarjeta', 'interes', 'cuotas', 'porcentaje tarjeta', 'sumar porcentaje', 'recargo por tarjeta', 'mas 10', 'financiacion'],
      a: 'En la ventana de cobro, al elegir tarjeta aparece <b>💳 Recargo por tarjeta</b>: tocá <b>Sin recargo</b>, <b>+5%</b>, <b>+10%</b>, <b>+15%</b>, <b>+21%</b> o escribí un <b>% personalizado</b>. El total a cobrar se actualiza con el recargo.<br>Otra opción es cargar un <b>Precio Tarjeta</b> distinto en cada producto (Inventario) y usar la lista <b>Tarjeta</b> (F6).' },

    { id: 'v-vuelto', modulo: 'ventas',
      q: '¿Cómo calculo el vuelto?',
      kw: ['vuelto', 'cambio', 'monto recibido', 'cuanto me dio', 'devolver plata', 'calcular vuelto', 'billete', 'efectivo recibido', 'sencillo'],
      a: 'Al cobrar en efectivo, escribí en <b>Monto recibido</b> lo que te entregó el cliente y el sistema te muestra el <b>Vuelto</b> que tenés que darle.' },

    { id: 'v-cc', modulo: 'ventas',
      q: '¿Cómo vendo a cuenta corriente (fiado)?',
      kw: ['fiarle a un cliente', 'fiarle', 'vender fiado', 'dejar a deber', 'fiado', 'cuenta corriente', 'a cuenta', 'fiar', 'deuda cliente', 'cobrar despues', 'limite de credito', 'credito', 'anotar', 'que me pague despues', 'pagar mas tarde'],
      a: 'En la ventana de cobro elegí <b>Cuenta corriente (fiado)</b>. Antes tenés que haber seleccionado un <b>cliente</b> (si no, te lo pide).<br>Si el cliente tiene un <b>límite de crédito</b> y la venta lo supera, el sistema bloquea la venta y te dice cuánto le queda disponible.<br>La deuda queda en la ficha del cliente (Clientes), donde después registrás los pagos.' },

    { id: 'v-factura', modulo: 'ventas',
      q: '¿Cómo emito una factura electrónica al cobrar?',
      kw: ['factura electronica', 'facturar', 'afip', 'factura a', 'factura b', 'factura c', 'emitir factura', 'cae', 'factura al cobrar', 'cuit del cliente', 'arca', 'facturar la venta'],
      a: 'En la ventana de cobro, en <b>Factura electrónica AFIP</b>, cambiá "No emitir" a emitir. Elegí el <b>Tipo de comprobante</b> (se ofrece el que corresponde a tu condición de IVA en Ajustes: A o B si sos Responsable Inscripto, C si sos Monotributista), y completá el <b>CUIT del receptor</b> y el <b>Nombre / Razón social</b> si el cliente lo pide (si no, queda Consumidor Final).<br>Si es un servicio, tildá <b>"Es un servicio"</b> y cargá el período.<br>Al terminar, en la pantalla de venta confirmada tocás <b>Ver factura emitida</b>.' },

    { id: 'v-mp', modulo: 'ventas',
      q: '¿Cómo cobro con Mercado Pago, transferencia o tarjeta?',
      kw: ['mercado pago', 'mp', 'point', 'posnet', 'tarjeta', 'qr', 'debito', 'credito', 'terminal', 'transferencia', 'medios de pago', 'metodo de pago', 'como cobro con'],
      a: 'En la ventana de cobro, en <b>Medios de pago</b>, elegí el que corresponda (efectivo, tarjeta, transferencia, etc. según los que tengas cargados). Podés moverte con las flechas del teclado y apretar <b>Enter</b> para elegir.<br>Los medios de pago (y su recargo) los configura el administrador en <b>Ajustes</b>.' },

    { id: 'v-ticket', modulo: 'ventas',
      q: '¿Cómo imprimo el ticket o se lo mando al cliente por email?',
      kw: ['imprimir ticket', 'ticket', 'comprobante', 'imprimir', 'copia', 'email', 'mail', 'enviar comprobante', 'no imprime', 'imprimir de nuevo', 'copia del ticket'],
      a: 'Cuando se confirma la venta ("¡Venta Confirmada!"):<br>• <b>Imprimir ticket</b> (tecla <b>F5</b>). Después te pregunta si querés imprimir también la <b>copia</b> local.<br>• <b>Enviar comprobante por email</b>: escribí el email del cliente y tocá <b>Enviar</b> (requiere tener el correo configurado en Ajustes).<br>• <b>Nueva Venta</b> (<b>Enter</b>) para seguir.<br>Para reimprimir una venta vieja, buscala en <b>Historial</b>.' },

    { id: 'v-presupuesto', modulo: 'ventas',
      q: '¿Cómo hago un presupuesto desde el punto de venta?',
      kw: ['presupuesto desde ventas', 'generar presupuesto', 'cotizar', 'comprobante presupuesto', 'presupuesto en vez de venta', 'cotizacion rapida'],
      a: 'Cargá los productos en el carrito como siempre y, en <b>Comprobante</b>, cambiá de <b>Venta</b> a <b>Presupuesto</b>. El botón pasa a decir <b>Generar Presupuesto</b>: en vez de cobrar, crea un presupuesto con esos productos (no es una venta cobrada). Lo encontrás después en <b>Presupuestos</b>. Para volver a vender, tocá <b>Venta</b>.' },

    { id: 'v-siniva', modulo: 'ventas',
      q: '¿Qué es "Mostrar precio sin IVA"?',
      kw: ['sin iva', 'precio sin iva', 'neto', 'mostrar precio sin iva', 'iva en pantalla', 'precio neto', 'ver neto'],
      a: 'Es un interruptor del carrito: muestra los precios en pantalla <b>sin IVA</b> (neto). El carrito siempre muestra abajo el <b>Neto</b>, el <b>IVA</b> y el <b>TOTAL</b>.' },

    /* ───────── CAJA (detallado, según la pantalla real) ───────── */
    { id: 'c-abrir', modulo: 'caja',
      q: '¿Cómo abro la caja?',
      kw: ['abrir caja', 'abrir turno', 'iniciar caja', 'caja cerrada', 'efectivo inicial', 'cambio inicial', 'apertura', 'comenzar turno', 'empezar el dia', 'monto inicial', 'no hay caja abierta'],
      a: '1. Entrá a <b>Caja</b> y tocá <b>Abrir Caja</b>.<br>2. En <b>Terminal / Nombre de caja</b> poné cuál es (ej: Caja 1, Mostrador).<br>3. En <b>Monto inicial en efectivo</b> cargá el cambio con el que arrancás.<br>4. Tocá <b>Abrir Caja y Comenzar</b>.<br><br>Si ves "No hay caja abierta en este momento", es que todavía no se abrió el turno. La caja es <b>por sucursal</b>.<br>Ojo: el sistema te deja vender sin caja abierta, pero sin turno no vas a poder hacer el cierre de caja de ese período.',
      link: ['Ir a Caja', '/caja/turno'] },

    { id: 'c-panel', modulo: 'caja',
      q: '¿Qué muestra la pantalla de Caja mientras está abierta?',
      kw: ['panel de caja', 'cuanto hay en caja', 'efectivo esperado', 'total del turno', 'ventas del turno', 'ver caja', 'resumen de caja', 'cuanto vendi en el turno', 'movimientos netos', 'ventas por metodo'],
      a: 'Con la caja abierta ves quién es el <b>cajero</b>, desde cuándo y el monto <b>inicial</b>, y estos totales: <b>Total del turno</b>, <b>Ventas del turno</b>, <b>Movimientos netos</b> y <b>Efectivo esperado</b>. Más abajo, las <b>Ventas por método de pago</b> y los <b>Movimientos manuales</b>.<br>El <b>efectivo esperado</b> es: monto inicial + ventas cobradas en efectivo + ingresos − retiros. En un pago mixto solo cuenta la parte en efectivo, y las ventas anuladas no cuentan.' },

    { id: 'c-movimiento', modulo: 'caja',
      q: '¿Cómo registro un retiro o un ingreso de plata en la caja?',
      kw: ['retiro', 'ingreso', 'sacar plata', 'meter plata', 'retirar efectivo', 'pago a proveedor', 'movimiento de caja', 'movimiento manual', 'agregar movimiento', 'gasto de caja', 'sacar de la caja', 'deposito'],
      a: 'En la pantalla de <b>Caja</b>, en <b>Movimientos manuales</b>, tocá <b>+ Agregar</b>:<br>1. Elegí <b>Ingreso</b> (entra plata) o <b>Retiro</b> (sale plata).<br>2. Poné el <b>Monto</b> (mayor a 0).<br>3. En <b>Descripción</b> aclará el motivo (ej: "Pago proveedor", "vuelto caja").<br>4. Tocá <b>Confirmar</b>.<br>Esto ajusta el efectivo esperado, así el cierre cuadra. Si no los cargás, vas a tener diferencia.' },

    { id: 'c-cerrar', modulo: 'caja',
      q: '¿Cómo cierro la caja al final del día?',
      kw: ['cerrar caja', 'cierre', 'cerrar turno', 'arqueo', 'fin del dia', 'contar plata', 'cierre de caja', 'cuadrar', 'cierro la caja', 'contar efectivo', 'terminar turno'],
      a: '1. Entrá a <b>Caja</b> y tocá <b>Cerrar Caja</b>.<br>2. Si querés, escribí el <b>Efectivo contado</b> (lo que realmente hay en el cajón). Es opcional, pero recomendable: el sistema lo compara con el <b>efectivo esperado</b> y calcula la diferencia, y queda registrado en <b>Auditoría</b>.<br>3. Confirmá el cierre.<br><br>El turno cerrado queda en el <b>Historial de turnos</b>: tocá <b>Ver</b> para ver el detalle (inicial, total de ventas, efectivo, esperado, contado, diferencia, ventas por método y movimientos).',
      link: ['Ir a Caja', '/caja/turno'] },

    { id: 'c-diferencia', modulo: 'caja',
      q: 'Me da diferencia en el cierre de caja',
      kw: ['diferencia', 'no cierra', 'sobrante', 'faltante', 'no cuadra', 'falta plata', 'sobra plata', 'descuadre', 'no me cierra la caja', 'me falta plata en caja'],
      a: 'La diferencia es <b>efectivo contado − efectivo esperado</b>. Revisá:<br>• ¿Hubo <b>retiros o ingresos</b> de efectivo sin cargar en Movimientos manuales?<br>• ¿Se <b>anuló</b> una venta (las anuladas no suman) o se cobró con otro medio en vez de efectivo?<br>• En <b>pagos mixtos</b> solo cuenta la parte en efectivo.<br>• ¿Estaba bien el <b>monto inicial</b>?<br>• Si el cajero hizo ventas mientras estaba <b>otra caja/sucursal</b> distinta, no cuentan en este turno.<br>En <b>Ver detalle</b> del turno ves cada total para encontrar de dónde sale.' },

    { id: 'c-nota', modulo: 'caja',
      q: '¿Para qué sirve la "Nota de caja"?',
      kw: ['nota de caja', 'nota', 'aviso', 'dejar mensaje', 'recordatorio caja', 'quedaron', 'dejar aviso', 'guardar nota', 'mensaje entre turnos'],
      a: 'Es un espacio para dejar un <b>aviso entre turnos</b> (ej: "quedaron $40.000 guardados el viernes"). Escribilo y tocá <b>Guardar nota</b>: queda con fecha, hora y quién la editó. Funciona aunque la caja esté cerrada.' },

    { id: 'c-historial', modulo: 'caja',
      q: '¿Cómo veo los turnos de caja anteriores?',
      kw: ['historial de turnos', 'turnos anteriores', 'cajas cerradas', 'ver turno', 'cierre anterior', 'caja de ayer', 'reporte de caja', 'detalle del turno', 'quien cerro'],
      a: 'Al final de la pantalla de <b>Caja</b> está el <b>Historial de turnos</b> con cajero, apertura, cierre, inicial, ventas y estado. Tocá <b>Ver</b> en un turno para abrir el <b>Detalle del turno</b>.<br>Para ver el listado completo de ventas con filtros o anular alguna, usá <b>Historial</b>.' },

    /* ───────── HISTORIAL ───────── */
    /* ───────── CLIENTES (detallado, según la pantalla real) ───────── */
    { id: 'cl-nuevo', modulo: 'clientes',
      q: '¿Cómo cargo un cliente nuevo?',
      kw: ['nuevo cliente', 'agregar cliente', 'crear cliente', 'cargar cliente', 'alta cliente', 'dni', 'cuit', 'datos del cliente', 'registrar cliente', 'anotar cliente', 'sumar cliente'],
      a: '1. En <b>Clientes</b> tocá <b>Nuevo Cliente</b>.<br>2. Completá el <b>Nombre *</b> (nombre completo o razón social). Lo único obligatorio es el nombre.<br>3. Si querés, cargá <b>CUIT / DNI</b>, <b>Teléfono</b>, <b>Email</b>, <b>Dirección</b>, <b>Localidad</b> y la <b>Condición IVA</b> (Consumidor Final, Responsable Inscripto, Monotributista, Exento o No Responsable).<br>4. Elegí una <b>Categoría</b> (o creá una nueva con el botón <b>+</b>).<br>5. Si vas a fiarle, poné el <b>Monto máximo de deuda ($)</b>.<br>6. Guardá.<br><br>Para facturar con CUIT o mandarle recordatorios por WhatsApp, conviene cargar esos datos bien.',
      link: ['Ir a Clientes', '/clientes'] },

    { id: 'cl-cuenta', modulo: 'clientes',
      q: '¿Cómo funciona la cuenta corriente de un cliente?',
      kw: ['cuanto me debe un cliente', 'cuanto me debe', 'cuenta corriente', 'deuda', 'debe', 'saldo', 'ver cuenta', 'movimientos', 'estado de cuenta', 'saldo a favor', 'historial de movimientos', 'fiado'],
      a: 'Cuando vendés a <b>cuenta corriente (fiado)</b> el importe queda como deuda del cliente. En <b>Clientes</b> ves el <b>Saldo</b> de cada uno (en rojo si debe).<br>Tocá el botón <b>Cuenta</b> de su fila para ver el <b>Historial de movimientos</b>: cada cargo y cada pago, con el <b>Total cargado</b>, el <b>Total pagado</b> y el saldo que va quedando. Desde ahí también podés <b>cobrar</b>, <b>registrar un cargo</b> o <b>exportar el estado de cuenta</b>.' },

    { id: 'cl-pago', modulo: 'clientes',
      q: '¿Cómo registro que un cliente me pagó una deuda?',
      kw: ['registrar pago', 'cobrar deuda', 'me pago', 'pago de deuda', 'cobrar al cliente', 'entrega', 'cancelar deuda', 'abonar', 'pago a cuenta', 'cobranza', 'me dio plata'],
      a: '1. En <b>Clientes</b>, en la fila del cliente tocá el botón de <b>cobrar</b> (o desde <b>Cuenta → Cobrar</b>). Se abre <b>Registrar Pago</b>.<br>2. Ves el <b>Saldo deudor total</b>. Escribí el <b>Monto a cobrar ($)</b>, o tocá <b>Pagar todo</b> para cancelar la deuda completa. Debajo aparece el <b>Saldo pendiente tras el pago</b>.<br>3. Elegí el <b>Medio de cobro</b> (efectivo, transferencia, etc.) y, si querés, una descripción (ej: "Transferencia").<br>4. Confirmá.<br><br><b>Importante:</b> si cobrás en <b>efectivo</b> y la caja está abierta, la plata se suma sola a la caja. Si no hay caja abierta, el sistema te avisa que <b>no se sumó</b>: abrí la caja y cargalo como ingreso (Movimientos manuales).<br>Después podés mandarle el <b>comprobante por WhatsApp</b> (necesita tener el celular cargado).' },

    { id: 'cl-cargo', modulo: 'clientes',
      q: '¿Cómo le anoto a un cliente algo que se llevó sin hacer una venta?',
      kw: ['registrar cargo', 'cargo', 'anotar deuda', 'se llevo', 'sumar a la cuenta', 'fiar sin venta', 'deuda manual', 'anotar fiado', 'agregar deuda', 'bolsa de harina'],
      a: 'Usá <b>Registrar Cargo</b> (desde la <b>Cuenta</b> del cliente): es para anotar "lo que el cliente se lleva" y descontarlo del saldo a favor o sumarlo a su deuda.<br>Cargá el <b>Monto ($)</b> y una <b>Descripción</b> (ej: "Bolsa de harina", "Semana 1") y tocá <b>Registrar Cargo</b>.' },

    { id: 'cl-limite', modulo: 'clientes',
      q: '¿Cómo pongo un límite de deuda a un cliente?',
      kw: ['limite de credito', 'limite', 'monto maximo', 'tope de deuda', 'no puede deber mas', 'bloquear fiado', 'maximo de deuda', 'limite de fiado'],
      a: 'Al crear o editar el cliente (lápiz ✏️), completá <b>Monto máximo de deuda ($)</b>. Si lo dejás vacío queda <b>sin límite</b> y puede fiarse sin restricción. Si el cliente supera ese monto, <b>el sistema bloquea la venta</b> a cuenta corriente. En la lista ves el límite en la columna <b>Límite crédito</b>.' },

    { id: 'cl-whatsapp', modulo: 'clientes',
      q: '¿Cómo le recuerdo la deuda a un cliente por WhatsApp?',
      kw: ['whatsapp', 'recordar deuda', 'recordatorio', 'avisar deuda', 'mensaje', 'cobrar por whatsapp', 'wa', 'recordarle', 'celular', 'no abre whatsapp', 'enviar comprobante whatsapp'],
      a: 'En <b>Clientes</b>, en la fila de un cliente que debe, tocá el botón de <b>WhatsApp</b> ("Recordarle la deuda por WhatsApp"): se abre WhatsApp con el mensaje armado con su nombre y saldo.<br>Necesita que el cliente tenga <b>celular cargado</b>. Cargalo con código de área + número, sin 0 ni 15 (ej: <b>383 4123456</b>). Si te dice que no pudo interpretar el celular, editá al cliente y corregilo.' },

    { id: 'cl-filtros', modulo: 'clientes',
      q: '¿Cómo busco clientes o veo solo los que me deben?',
      kw: ['buscar cliente', 'deudores', 'quien me debe', 'filtrar clientes', 'al dia', 'ordenar', 'mayor deuda', 'lista de deudores', 'clientes con deuda', 'categoria'],
      a: 'En <b>Clientes</b> usá el buscador (por nombre o documento) y los botones <b>Todos</b>, <b>Deudores</b> y <b>Al día</b>. También podés filtrar por <b>categoría</b> y ordenar: <b>A → Z</b>, <b>Mayor deuda primero</b> o <b>Menor deuda primero</b>.' },

    { id: 'cl-importar', modulo: 'clientes',
      q: '¿Cómo cargo muchos clientes desde un Excel?',
      kw: ['importar clientes', 'subir clientes', 'excel clientes', 'carga masiva clientes', 'planilla clientes', 'csv clientes', 'cargar lista de clientes', 'muchos clientes'],
      a: '1. En <b>Clientes</b> tocá <b>Importar Excel</b>.<br>2. Descargá la <b>plantilla</b> si no tenés el formato. Las columnas reconocidas son: <b>nombre · documento · telefono · email · direccion · limite_credito</b>.<br>3. Arrastrá el archivo (.xlsx, .xls o .csv, máx. 5 MB) o hacé click para elegirlo.<br>4. Revisá el resumen: cuántos son <b>nuevos</b>, cuántos se <b>actualizan</b> y cuántos tienen <b>errores</b>.<br>5. Tocá <b>Importar</b> (o <b>← Volver</b> para cambiar de archivo).' },

    { id: 'cl-exportar', modulo: 'clientes',
      q: '¿Cómo descargo la lista de clientes o el estado de cuenta?',
      kw: ['exportar clientes', 'descargar clientes', 'csv', 'pdf', 'lista de clientes', 'estado de cuenta', 'imprimir deudas', 'bajar clientes', 'exportar estado de cuenta'],
      a: 'En <b>Clientes</b>, arriba de la tabla, tocá <b>CSV</b> o <b>PDF</b> para descargar la lista. Para el <b>estado de cuenta</b> de un cliente, abrí su <b>Cuenta</b> y usá el botón de exportar: sale con todos sus movimientos.' },

    { id: 'cl-editar', modulo: 'clientes',
      q: '¿Cómo edito o elimino un cliente?',
      kw: ['editar cliente', 'modificar cliente', 'cambiar telefono', 'corregir cliente', 'eliminar cliente', 'borrar cliente', 'quitar cliente', 'actualizar datos'],
      a: 'En <b>Clientes</b>, en la fila del cliente: el <b>lápiz ✏️</b> es <b>Editar</b> y el <b>tacho 🗑️</b> es <b>Eliminar</b> (te pide confirmar "¿Eliminar cliente?"). Si el sistema no te deja eliminarlo, te muestra el motivo.' },

    { id: 'cl-compras', modulo: 'clientes',
      q: '¿Cómo veo qué compró un cliente?',
      kw: ['historial de compras', 'que compro', 'compras del cliente', 'producto mas comprado', 'ver compras', 'ventas del cliente', 'cuanto compro'],
      a: 'En <b>Clientes</b>, en la fila del cliente tocá el botón de <b>historial de compras</b>. Ves todas sus compras (podés buscar por N° de venta, producto o medio de pago) y su <b>producto más comprado</b>.' },

    /* ───────── HISTORIAL (detallado, según la pantalla real) ───────── */
    { id: 'h-buscar', modulo: 'historial',
      q: '¿Cómo busco una venta anterior o filtro por fecha?',
      kw: ['ventas a cuenta corriente', 'solo cuenta corriente', 'buscar venta', 'venta anterior', 'historial', 'ventas pasadas', 'encontrar venta', 'filtrar', 'por fecha', 'ventas de ayer', 'numero de ticket', 'buscar por cae', 'ventas del mes', 'ver ventas'],
      a: 'En <b>Historial</b> (Historial de Ventas) tenés estos filtros:<br>• Buscador por <b>N° de venta, producto o CAE</b>.<br>• <b>Desde / Hasta</b> (fechas).<br>• <b>Método</b> de pago.<br>• <b>Facturación</b>: todas, sin facturar o ya facturadas.<br>• Casilla <b>Solo cuenta corriente</b>.<br>Tocá <b>Buscar</b> para aplicar y <b>Limpiar</b> para borrar los filtros. Con las pestañas <b>Todas / Completadas / Anuladas</b> filtrás por estado.<br>Arriba ves los totales: <b>Total período</b>, <b>Ventas</b> y <b>Anuladas</b>.',
      link: ['Ir al Historial', '/historial'] },

    { id: 'h-detalle', modulo: 'historial',
      q: '¿Cómo veo el detalle de una venta (productos, pagos, vendedor)?',
      kw: ['quien hizo esta venta', 'quien hizo la venta', 'quien atendio', 'que vendedor', 'detalle de venta', 'ver venta', 'que se vendio', 'items de la venta', 'quien vendio', 'vendedor', 'pagos', 'descuento aplicado', 'recargo', 'precio modificado', 'ver ticket', 'abrir venta'],
      a: 'En <b>Historial</b> tocá la fila de la venta y se despliega el detalle: <b>Items de la venta</b>, los <b>pagos</b> y el vuelto, el <b>vendedor</b>, el cliente y el estado (Completada / Anulada). También te marca si hubo <b>descuento</b>, <b>recargo</b> o si se <b>modificó un precio a mano</b>. Si estaba facturada, ves el <b>CAE</b>.' },

    { id: 'v-anular', modulo: 'historial',
      q: '¿Cómo anulo una venta?',
      kw: ['anular', 'cancelar venta', 'me equivoque', 'error en venta', 'devolver', 'devolucion', 'borrar venta', 'eliminar venta', 'reversar', 'venta duplicada', 'deshacer venta', 'anulo una venta'],
      a: '1. Entrá a <b>Historial</b> y buscá la venta.<br>2. En su fila tocá el botón <b>Anular venta</b>.<br>3. Escribí el <b>Motivo de anulación</b> (es obligatorio; ej: "Error en la carga", "devolución del cliente", "venta duplicada").<br>4. Confirmá.<br><br>Al anular, <b>se devuelve el stock</b> de los productos y <b>no se puede deshacer</b>: la venta queda marcada como <b>Anulada</b> (con el motivo). Si la venta estaba <b>facturada</b>, el sistema emite solo la <b>Nota de Crédito</b> ante AFIP antes de anularla.<br>Si no te aparece el botón, tu usuario puede no tener permiso: consultá al administrador (Ajustes → Usuarios).',
      link: ['Ir al Historial', '/historial'] },

    { id: 'h-reimprimir', modulo: 'historial',
      q: '¿Cómo reimprimo un ticket?',
      kw: ['reimprimir', 'imprimir ticket', 'ticket', 'copia', 'duplicado', 'imprimir de nuevo', 'impresora', 'otra copia', 'volver a imprimir', 'perdi el ticket'],
      a: 'En <b>Historial</b>, tocá la venta para desplegar el detalle y usá <b>Reimprimir ticket</b>. Si la venta tiene factura, también está el botón <b>PDF Factura</b>.' },

    { id: 'h-facturar', modulo: 'historial',
      q: '¿Cómo facturo una venta que ya hice (sin factura)?',
      kw: ['facturar despues', 'facturar venta anterior', 'factura posterior', 'olvide facturar', 'emitir factura', 'sin facturar', 'factura a una venta', 'cliente pide factura', 'pdf factura', 'facturar historial'],
      a: '1. En <b>Historial</b> abrí la venta (podés filtrar con <b>Facturación → Sin facturar</b>) y tocá <b>Facturar</b>.<br>2. Elegí el tipo de comprobante: <b>A</b> (Resp. Inscripto a Resp. Inscripto), <b>B</b> (a Consumidor Final o Monotributo) o <b>C</b> (Monotributista a cualquier receptor).<br>3. Para Factura A cargá el <b>CUIT del receptor</b>; en todos los casos podés poner el <b>Nombre / Razón social</b> (si no, queda Consumidor Final).<br>4. Confirmá: aparece <b>¡Factura emitida con éxito!</b> con el <b>Nro. de comprobante</b>, el <b>CAE</b> y su vencimiento, y podés bajar el <b>PDF Factura</b>.' },

    { id: 'h-exportar', modulo: 'historial',
      q: '¿Cómo exporto las ventas a Excel?',
      kw: ['exportar ventas', 'excel ventas', 'descargar ventas', 'bajar ventas', 'planilla de ventas', 'xlsx', 'reporte de ventas excel'],
      a: 'En <b>Historial</b>, filtrá el período y lo que necesitás, y tocá <b>Exportar Excel</b>.' },

    /* ───────── PRESUPUESTOS (detallado, según la pantalla real) ───────── */
    { id: 'p-crear', modulo: 'presupuestos',
      q: '¿Cómo hago un presupuesto?',
      kw: ['hago un presupuesto', 'hacer un presupuesto', 'presupuesto', 'cotizacion', 'cotizar', 'nuevo presupuesto', 'crear presupuesto', 'proforma', 'hacer un presupuesto', 'armar presupuesto', 'presupuestar'],
      a: '1. En <b>Presupuestos</b> tocá <b>Nuevo presupuesto</b>.<br>2. <b>Datos del cliente</b>: buscá uno ya cargado ("Escribí el nombre o CUIT/DNI para autocompletar") o completá a mano <b>Nombre / Razón social *</b>, CUIT/DNI, email, teléfono, condición IVA, dirección y localidad.<br>3. <b>Condiciones</b>: Condición de pago, <b>Válido por (días)</b> (vacío = sin vencimiento) e <b>IVA por defecto en ítems</b> (Sin IVA, Exento, 10,5% o 21%).<br>4. <b>Ítems</b>: agregá productos (ver "¿Cómo agrego ítems?").<br>5. Si querés, cargá observaciones al pie y un <b>Descuento</b> o <b>Recargo general (%)</b>.<br>6. Guardá. Queda en estado <b>Borrador</b>.',
      link: ['Ir a Presupuestos', '/presupuestos'] },

    { id: 'p-items', modulo: 'presupuestos',
      q: '¿Cómo agrego ítems o servicios a un presupuesto?',
      kw: ['agregar items', 'agregar productos', 'servicio', 'mano de obra', 'item personalizado', 'catalogo', 'producto del inventario', 'descripcion', 'cantidad', 'precio unitario', 'descuento por item', 'hora', 'metro'],
      a: 'Dentro del presupuesto, en <b>Ítems del presupuesto</b> tenés tres formas de agregar:<br>• <b>Producto</b>: buscá en tu inventario por nombre o SKU.<br>• <b>Catálogo</b>: tu <b>lista de precios de presupuestos</b> (servicios o trabajos que repetís).<br>• <b>Ingresar ítem personalizado</b>: escribís la <b>Descripción</b> (ej: "Servicio de instalación"), la <b>Cantidad</b> y el <b>Precio unitario</b>.<br>Cada línea te deja cambiar cantidad, <b>Precio unit.</b>, <b>Desc.%</b> e IVA, y muestra el <b>Subtotal s/IVA</b>. Abajo ves Subtotal, Descuento y <b>Total</b>.' },

    { id: 'p-catalogo', modulo: 'presupuestos',
      q: '¿Cómo cargo mis servicios en la lista de precios de presupuestos?',
      kw: ['lista de precios de presupuestos', 'catalogo de servicios', 'cargar servicio', 'nuevo item catalogo', 'precio de servicio', 'unidad', 'm2', 'hora', 'editar catalogo', 'servicios frecuentes'],
      a: 'En el presupuesto, pestaña <b>Catálogo</b> → <b>Agregar nuevo ítem al catálogo</b>: escribí el <b>Nombre / descripción</b>, el <b>Precio</b>, la <b>Unidad</b> (unidad, hora, servicio, m², m³, kg, lt, global) y, si querés, una descripción (ej: "Incluye materiales"). Después los agregás a cualquier presupuesto con un click. Con los íconos ✏️ y 🗑️ los editás o borrás.' },

    { id: 'p-estados', modulo: 'presupuestos',
      q: '¿Qué significan los estados del presupuesto y cómo los cambio?',
      kw: ['acepto el presupuesto', 'aceptaron el presupuesto', 'el cliente acepto', 'rechazo el presupuesto', 'estado', 'borrador', 'enviado', 'aprobado', 'rechazado', 'cambiar estado', 'marcar enviado', 'aprobar', 'rechazar', 'pendientes'],
      a: 'Los estados son: <b>📝 Borrador</b> (recién creado), <b>📤 Enviado</b> (se lo pasaste al cliente), <b>✅ Aprobado</b> (el cliente aceptó) y <b>❌ Rechazado</b>.<br>Para cambiarlo: en la lista tocá la etiqueta de estado ("Tocar para cambiar el estado"), elegí el <b>Nuevo estado</b> y <b>Guardar</b>. O abriendo el presupuesto, con los botones <b>Marcar enviado</b> y <b>Aprobar</b>.<br>Arriba de la lista ves cuántos hay en cada estado y el <b>Monto total</b>.' },

    { id: 'p-a-venta', modulo: 'presupuestos',
      q: '¿Cómo convierto un presupuesto en venta?',
      kw: ['convertir', 'pasar a venta', 'presupuesto aprobado', 'aceptaron presupuesto', 'facturar presupuesto', 'confirmar presupuesto', 'cobrar presupuesto', 'convertir a venta', 'del presupuesto a la venta', 'cargar en ventas'],
      a: '1. Primero el presupuesto tiene que estar <b>Aprobado</b> (con el botón <b>Aprobar</b>).<br>2. Abrilo (ícono de ver) y tocá <b>Convertir a venta</b>.<br>3. Se abre el <b>Punto de venta</b> con el carrito ya cargado con los ítems y el cliente: revisá y cobrá como una venta normal.<br>Si ya se generó una venta de ese presupuesto, el botón dice <b>Cargar de nuevo en Ventas</b> y te muestra el N° de venta: no se duplica sola, vuelve a cargar el carrito.' },

    { id: 'p-imprimir', modulo: 'presupuestos',
      q: '¿Cómo imprimo o le paso el presupuesto al cliente?',
      kw: ['imprimir presupuesto', 'pdf presupuesto', 'a4', 'termica', 'ver presupuesto', 'mandar presupuesto', 'enviar presupuesto', 'compartir', 'imprimir a4', 'ticket presupuesto'],
      a: 'En <b>Presupuestos</b>, tocá el ícono de <b>Ver / Imprimir</b> y usá <b>Imprimir A4</b> (hoja completa, también sirve para guardar en PDF) o <b>Térmica</b> (ticket). El documento incluye tus datos, los ítems, el total, la condición de pago, la validez y las notas que cargaste. Después acordate de pasarlo a <b>Enviado</b>.' },

    { id: 'p-editar', modulo: 'presupuestos',
      q: '¿Cómo edito o elimino un presupuesto?',
      kw: ['editar presupuesto', 'modificar presupuesto', 'corregir presupuesto', 'eliminar presupuesto', 'borrar presupuesto', 'cambiar precio presupuesto', 'actualizar presupuesto'],
      a: 'En la lista de <b>Presupuestos</b> cada fila tiene <b>✏️ Editar</b>, <b>🗑️ Eliminar</b> y el ícono de <b>Ver / Imprimir</b> (adentro también está el botón <b>Editar</b>). Para buscar usá "Buscar cliente, número…" y el filtro de estados.' },

    /* ───────── REMITOS (detallado, según la pantalla real) ───────── */
    { id: 'rm-crear', modulo: 'remitos',
      q: '¿Cómo genero un remito?',
      kw: ['remito', 'nuevo remito', 'entrega', 'envio', 'mercaderia', 'comprobante de entrega', 'crear remito', 'generar remito', 'remito desde presupuesto', 'hacer un remito'],
      a: 'Hay dos formas:<br><b>1) Desde un presupuesto aprobado:</b> en el presupuesto (o en la lista) tocá <b>Generar remito</b>. Se arma con sus ítems.<br><b>2) Uno nuevo directo:</b> en <b>Remitos</b> tocá <b>Nuevo remito</b>, completá los <b>Datos del cliente</b> (nombre, CUIT/DNI, <b>dirección de entrega</b>, barrio, localidad, teléfono, IVA), la condición de venta y el vendedor; en <b>Mercadería a entregar</b> buscá cada producto por nombre o SKU y poné cantidad y unidad; agregá notas (ej: "entregar en horario de mañana") y tocá <b>Generar remito</b>.<br>Después lo imprimís desde el ícono de <b>Ver / Imprimir</b>.',
      link: ['Ir a Remitos', '/remitos'] },

    { id: 'rm-estados', modulo: 'remitos',
      q: '¿Qué estados tiene un remito y cómo lo marco como entregado?',
      kw: ['entregado', 'emitido', 'anulado', 'estado remito', 'marcar entregado', 'cambiar estado remito', 'pendiente de entregar', 'ya entregue', 'confirmar entrega'],
      a: 'Los estados son: <b>📤 Emitido</b> (pendiente de entregar), <b>✅ Entregado</b> y <b>❌ Anulado</b> (sin efecto). Para cambiarlo, en la lista de <b>Remitos</b> tocá el ícono <b>Cambiar estado</b>, elegí el <b>Nuevo estado</b> y <b>Guardar</b>. Arriba ves cuántos hay de cada uno.' },

    /* ───────── REPORTES ───────── */
    /* ───────── CAJA ───────── */
    /* ───────── CLIENTES ───────── */
    /* ───────── PRESUPUESTOS / REMITOS ───────── */
    /* ───────── INVENTARIO / STOCK ───────── */
    { id: 'i-etiquetas', modulo: 'inventario',
      q: '¿Cómo imprimo etiquetas con código de barras?',
      kw: ['etiqueta', 'etiquetas', 'imprimir codigo de barras', 'imprimir etiquetas', 'precio en gondola', 'rotular', 'barcode', 'etiquetado'],
      a: 'Entrá a <b>Inventario → Etiquetado</b>, elegí los productos y la cantidad de etiquetas, y mandalo a imprimir. Cada etiqueta lleva el código de barras y el precio.',
      link: ['Ir a Etiquetado', '/inventario/etiquetas'] },

    /* ───────── INVENTARIO (detallado, según la pantalla real) ───────── */
    { id: 'i-producto', modulo: 'inventario',
      q: '¿Cómo cargo un producto nuevo?',
      kw: ['nuevo producto', 'agregar producto', 'crear producto', 'cargar producto', 'alta producto', 'articulo', 'dar de alta', 'cargo un producto', 'sumar producto', 'registrar producto', 'codigo de barras', 'agrego el codigo de barras', 'agregar codigo de barras', 'cargar codigo de barras', 'poner codigo de barras', 'asignar codigo de barras', 'escanear producto', 'escaner', 'lector de codigo', 'sku'],
      a: '1. Entrá a <b>Inventario</b> y tocá el botón <b>Nuevo Producto</b>.<br>2. Completá el <b>Nombre</b> (obligatorio). El <b>SKU / Código</b> se genera solo; podés cambiarlo o <b>escanear el código de barras</b> del producto ahí mismo.<br>3. Elegí o escribí la <b>Categoría</b> y poné el <b>Stock inicial</b> (cuántas unidades tenés hoy).<br>4. En <b>Precio Costo</b> cargá lo que te cuesta. Con el <b>Margen (%)</b> el sistema calcula solo el <b>Precio Venta Final</b> (costo + margen); o podés escribir el precio de venta directamente. El <b>Precio Venta Final es obligatorio</b>.<br>5. Tocá <b>Guardar producto</b>.<br><br>Todo lo demás es opcional: stock mínimo, descripción, imagen, precio mayorista, promoción… (preguntame por cada uno).<br><b>Ojo:</b> la fecha de vencimiento no se carga acá, sino en la pantalla <b>Vencimientos</b>.',
      link: ['Ir a Inventario', '/inventario'] },

    { id: 'i-margen', modulo: 'inventario',
      q: '¿Cómo funciona el margen y el precio de venta?',
      kw: ['margen', 'ganancia', 'precio costo', 'costo', 'precio de venta', 'porcentaje de ganancia', 'calcular precio', 'markup', 'cuanto gano'],
      a: 'El <b>Precio Venta Final</b> se calcula como <b>costo + margen</b>: si el costo es $1.000 y el margen 50%, el precio queda en $1.500 (redondeado). El margen viene en <b>50%</b> por defecto: cambialo si necesitás otro.<br>Si preferís poner vos el precio, escribilo directo en <b>Precio Venta Final</b> y el sistema te muestra qué margen te queda. El costo es opcional, pero sin costo no se calcula el margen ni la ganancia en los reportes.' },

    { id: 'i-editar', modulo: 'inventario',
      q: '¿Cómo edito un producto? (precio, nombre, categoría…)',
      kw: ['editar producto', 'modificar producto', 'cambiar precio', 'cambiar nombre', 'corregir producto', 'actualizar producto', 'lapiz', 'modificar precio', 'editar precio', 'cambiar categoria'],
      a: 'En <b>Inventario</b> buscá el producto (por nombre o código) y tocá el <b>lápiz ✏️</b> de su fila. Se abre la misma ventana de carga con los datos: cambiá lo que necesites y tocá <b>Guardar</b>.<br>El cambio vale para las ventas nuevas; las ventas ya hechas no se modifican.<br>Para cambiar el precio de <b>muchos productos a la vez</b>, usá <b>Actualizar precios</b>.' },

    { id: 'i-eliminar', modulo: 'inventario',
      q: '¿Cómo elimino un producto?',
      kw: ['eliminar producto', 'borrar producto', 'sacar producto', 'quitar producto', 'dar de baja producto', 'tacho', 'papelera', 'ya no vendo'],
      a: 'En <b>Inventario</b>, en la fila del producto tocá el ícono del <b>tacho 🗑️</b> y confirmá. Antes de eliminar, fijate que ya no lo necesites: si solo querés que no se venda más, podés editarlo y dejarlo sin stock.' },

    { id: 'i-stockmin', modulo: 'inventario',
      q: '¿Cómo pongo un stock mínimo / aviso de poco stock?',
      kw: ['stock minimo', 'poco stock', 'alerta de stock', 'aviso de stock', 'stock bajo', 'reposicion', 'se esta acabando', 'avisar cuando quede poco', 'minimo'],
      a: 'Al crear o editar el producto, completá <b>Stock mínimo</b> (ej: 5). Cuando el stock llegue a ese número o menos, el sistema te <b>avisa en el Dashboard</b>. En Inventario también podés filtrar con el botón <b>Stock bajo</b> y <b>Sin stock</b>.' },

    { id: 'i-pesable', modulo: 'inventario',
      q: '¿Cómo cargo un producto que se vende por peso (kg, gramos)?',
      kw: ['pesable', 'por peso', 'kilo', 'gramos', 'balanza', 'fiambre', 'granel', 'verduleria', 'carniceria', 'precio por kilo', 'vender por kg'],
      a: 'En el formulario de producto activá el interruptor <b>Producto Pesable</b> ("Precio por kg/gramo"). Cargá el precio <b>por kilo</b>. En el Punto de venta vas a poder poner la cantidad con decimales (ej: 0,5 para medio kilo).<br>Si además querés vender aunque el stock esté en 0 (típico de fiambres), activá <b>Vender sin control de stock</b>.' },

    { id: 'i-sinstock', modulo: 'inventario',
      q: '¿Cómo vendo un producto aunque no tenga stock?',
      kw: ['vender sin stock', 'sin control de stock', 'stock cero', 'vender en cero', 'no controlar stock', 'servicio', 'a pedido', 'stock negativo'],
      a: 'Editá el producto y activá el interruptor <b>Vender sin control de stock</b> ("permite vender aunque el stock esté en 0 — útil para fiambres, productos a granel, etc."). Así el Punto de venta no te frena cuando no hay unidades cargadas.' },

    { id: 'i-mayorista', modulo: 'inventario',
      q: '¿Cómo cargo un precio mayorista?',
      kw: ['mayorista', 'precio mayorista', 'por mayor', 'cantidad minima', 'precio por mayor', 'revendedor', 'lista mayorista'],
      a: 'En el formulario de producto, en la sección <b>Precio Mayorista</b>, tocá <b>Activar</b>. Cargá el <b>Precio Mayorista ($)</b> y la <b>Cantidad mínima (unidades)</b> a partir de la cual se aplica (ej: desde 4 unidades). Si no lo activás, siempre se usa el precio minorista.<br>Para varios precios según la cantidad, mirá <b>Precios por cantidad</b>.' },

    { id: 'i-escalones', modulo: 'inventario',
      q: '¿Cómo hago precios por cantidad (a más unidades, mejor precio)?',
      kw: ['precios por cantidad', 'escalon', 'escalones', 'descuento por cantidad', 'a mas unidades', 'por volumen', 'tramos', 'precio escalonado', 'agregar escalon'],
      a: 'En el formulario de producto, en <b>Precios por cantidad</b>, tocá <b>Agregar escalón</b> y cargá cantidad y precio. Ejemplo: 5 u → $21.000, 10 u → $18.000, 20 u → $15.000. En el Punto de venta se aplica solo según la cantidad que lleve el cliente.<br>Si cargás escalones, <b>tienen prioridad</b> sobre el precio mayorista simple.' },

    { id: 'i-tarjeta', modulo: 'inventario',
      q: '¿Cómo cargo un precio distinto para tarjeta?',
      kw: ['precio tarjeta', 'precio con tarjeta', 'tarjeta mas cara', 'lista tarjeta', 'recargo tarjeta producto', 'credito precio'],
      a: 'En el formulario de producto completá <b>Precio Tarjeta</b> (opcional). Se usa cuando el Punto de venta está en modo <b>Tarjeta</b>. Si lo dejás vacío, usa el precio minorista.<br>Para actualizar todos los precios de tarjeta de golpe (por ejemplo +10% sobre el minorista), usá <b>Actualizar precios</b>.' },

    { id: 'i-promo', modulo: 'inventario',
      q: '¿Cómo pongo un producto en promoción / oferta?',
      kw: ['promocion', 'promo', 'oferta', 'precio promo', 'rebajar producto', 'liquidacion', 'precio especial', 'poner en oferta'],
      a: 'Editá el producto y, en <b>Promoción</b>, tocá <b>Activar</b>. Cargá el <b>Precio Promo ($)</b>: el sistema te muestra cuánto se ahorra el cliente. Mientras esté activa, el Punto de venta usa ese precio. Para terminarla, desactivá el interruptor.' },

    { id: 'i-iva', modulo: 'inventario',
      q: '¿Cómo cargo el IVA de un producto?',
      kw: ['iva', 'alicuota', '21', '10.5', 'exento', 'impuesto', 'iva producto', 'responsable inscripto', 'iva masivo', 'neto'],
      a: 'Si tu comercio es <b>Responsable Inscripto</b>, el IVA es <b>obligatorio</b>: elegí la alícuota (21%, 10,5%, 27%, 5%, 2,5% o 0% exento) en el formulario. El precio que cargás es <b>final, con IVA incluido</b>, y abajo ves el "Desglose fiscal estimado" (neto e IVA).<br>Para el resto de las condiciones es opcional: tildá <b>IVA</b> y poné el porcentaje.<br>Para asignar IVA a muchos productos juntos, usá el botón <b>Asignar IVA masivo</b> (solo aparece para Responsable Inscripto).' },

    { id: 'i-imagen', modulo: 'inventario',
      q: '¿Cómo le pongo una foto al producto?',
      kw: ['foto', 'imagen', 'imagen del producto', 'subir foto', 'sacar foto', 'camara', 'galeria', 'quitar imagen'],
      a: 'En el formulario de producto, en <b>Imagen del producto</b>, tocá <b>Galería / Archivo</b> para elegir una foto guardada, o <b>Sacar foto</b> para usar la cámara del celular. Para quitarla, tocá la ✕ sobre la imagen.' },

    { id: 'i-vidriera', modulo: 'inventario',
      q: '¿Cómo muestro u oculto un producto en la vidriera digital?',
      kw: ['vidriera', 'publicar producto', 'ocultar producto', 'catalogo online', 'mostrar en catalogo', 'tienda online', 'no mostrar'],
      a: 'En el formulario de producto está el interruptor <b>Publicar en la vidriera digital</b>. Aplica si el catálogo está configurado en modo <b>"Desde Inventario"</b> o <b>"Ambos combinados"</b>. Desactivalo para ocultar ese producto.' },

    { id: 'i-variantes', modulo: 'inventario',
      q: '¿Cómo cargo varios productos parecidos (talles, colores, medidas)?',
      kw: ['carga rapida', 'variantes', 'talles', 'colores', 'medidas', 'varios productos', 'mismo producto', 'talle s m l', 'remera', 'llave', 'pesos'],
      a: 'Usá el botón <b>Carga rápida</b> en Inventario:<br>1. Poné el <b>Nombre base</b> (ej: "Llave Ferrawi"), <b>Categoría</b>, <b>Precio</b> y <b>Stock inicial</b>.<br>2. En <b>Variantes</b> escribí una por línea (11mm, 12mm…) o tocá un atajo: <b>S M L XL</b>, <b>Medidas mm</b>, <b>Colores</b> o <b>Pesos</b>.<br>3. Tocá <b>Previsualizar</b> para ver los productos que se van a crear ("Llave Ferrawi 11mm", etc.).<br>4. Tocá <b>Crear productos</b>.' },

    { id: 'i-actprecios', modulo: 'inventario',
      q: '¿Cómo actualizo los precios de todos los productos (aumento)?',
      kw: ['actualizar precios', 'aumento', 'aumentar precios', 'subir precios', 'inflacion', 'reducir precios', 'precios masivo', 'aumento general', 'ajustar precios', 'porcentaje todos'],
      a: 'Usá el botón <b>Actualizar precios</b> en Inventario. Son 4 pasos en pantalla:<br>1. <b>Tomar como base</b>: el precio Minorista o el Mayorista.<br>2. <b>Actualizar precio de</b>: Tarjeta, Mayorista o Minorista.<br>3. <b>Operación</b>: % Aumentar, % Reducir, $ Aumentar monto fijo o $ Reducir monto fijo.<br>4. <b>Aplicar a</b>: todos los productos o una categoría.<br>Antes de confirmar ves una previsualización; después tocá <b>Aplicar a N productos</b>.' },

    { id: 'i-importar', modulo: 'inventario',
      q: '¿Cómo cargo muchos productos desde un Excel?',
      kw: ['importar excel', 'carga masiva', 'cargar 200 productos', 'cientos de productos', 'tengo muchos productos', 'cargar todos mis productos', 'miles de productos', 'lista grande', 'subir excel', 'planilla', 'importar productos', 'cargar desde excel', 'csv', 'xlsx', 'muchos productos', 'migrar productos', 'plantilla'],
      a: '1. En <b>Inventario</b> tocá <b>Importar Excel</b>.<br>2. Descargá la <b>plantilla de ejemplo</b> y completala (las columnas pueden ir en cualquier orden; las obligatorias están marcadas con *).<br>3. Arrastrá el archivo (.xlsx, .xls o .csv, máx. 5 MB) o hacé click para elegirlo.<br>4. Revisá la previsualización. Si hay productos que ya existen te marca <b>conflictos</b>: elegí <b>Actualizar</b> o <b>Ignorar</b> (uno por uno, o <b>Actualizar todos</b> / <b>Ignorar todos</b>).<br>5. Tocá <b>Importar</b>.<br>Las columnas incluyen nombre, precio, stock, categoría, IVA, precios mayorista/tarjeta/costo, promo y pesable.' },

    { id: 'i-exportar', modulo: 'inventario',
      q: '¿Cómo descargo mi lista de productos en Excel?',
      kw: ['exportar', 'exportar xlsx', 'descargar productos', 'bajar inventario', 'lista de productos', 'excel de productos', 'backup productos'],
      a: 'En <b>Inventario</b> tocá <b>Exportar XLSX</b>: se descarga una planilla con tus productos.' },

    { id: 'i-lista', modulo: 'inventario',
      q: '¿Cómo veo los precios mayorista o de tarjeta en la lista?',
      kw: ['ver precio mayorista', 'ver precio tarjeta', 'cambiar lista', 'minorista mayorista tarjeta', 'columna precio', 'ver otra lista'],
      a: 'Arriba de la tabla de Inventario hay tres botones: <b>Minorista</b>, <b>Mayorista</b> y <b>Tarjeta</b>. Al tocar uno, la columna de precios muestra esa lista.' },

    { id: 'i-mover', modulo: 'inventario',
      q: '¿Cómo paso stock de una sucursal/depósito a otra?',
      kw: ['mover stock', 'pasar mercaderia', 'transferir stock', 'traslado', 'entre sucursales', 'deposito', 'mover mercaderia', 'enviar a sucursal', 'transferencia'],
      a: 'Si tenés más de una sucursal o depósito, en la fila de cada producto aparece un botón para <b>mover stock</b>. Elegí <b>Desde</b> (origen), <b>Hacia</b> (destino) y la <b>Cantidad a mover</b>, y confirmá. El stock se resta de un lado y se suma en el otro.' },

    { id: 'i-filtros', modulo: 'inventario',
      q: '¿Cómo busco productos o veo los que no tienen stock?',
      kw: ['buscar producto', 'filtrar', 'sin stock', 'stock bajo', 'productos agotados', 'encontrar producto', 'categoria filtro', 'buscador'],
      a: 'En <b>Inventario</b> usá el buscador (por nombre o código) y los botones de filtro: <b>Todos</b>, <b>Sin stock</b> y <b>Stock bajo</b>. También podés filtrar por categoría.' },

    /* ───────── STOCK ───────── */
    { id: 's-ajustar', modulo: 'stock',
      q: '¿Cómo corrijo el stock de un producto?',
      kw: ['ajustar stock', 'corregir stock', 'stock no coincide', 'recuento', 'conteo', 'sumar stock', 'restar stock', 'merma', 'rotura', 'ingreso de mercaderia', 'cambiar cantidad', 'inventario fisico', 'actualizar stock', 'me equivoque en el stock', 'equivoco el stock', 'stock equivocado', 'stock mal cargado', 'tengo mal el stock', 'el stock esta mal', 'cargue mal el stock'],
      a: 'Entrá a <b>Stock</b>, buscá el producto y en su fila cambiá la <b>cantidad</b> por la real; después tocá <b>Guardar</b> de esa fila.<br>Tip: también funciona escaneando el código de barras del producto desde el buscador. En Inventario además hay botones rápidos para sumar o restar (−5, −1, +1, +5, +10) y aplicar una cantidad personalizada.',
      link: ['Ir a Stock', '/stock'] },

    { id: 's-hay', modulo: 'stock',
      q: '¿Qué significa el interruptor Hay / No hay en Stock?',
      kw: ['hay no hay', 'switch hay', 'sin cantidad', 'disponible', 'pesable stock', 'balanza stock', 'se vende sin importar el stock'],
      a: 'Los productos que se venden <b>sin control de stock</b> (por ejemplo fiambres o productos a granel) no llevan cantidad: en <b>Stock</b> aparecen en la pestaña <b>Hay / No hay</b> con un interruptor para marcar si tenés o no. Los que llevan cantidad están en la pestaña <b>Con cantidad</b>.' },

    { id: 's-faltantes', modulo: 'stock',
      q: '¿Cómo veo e imprimo qué productos me faltan?',
      kw: ['faltantes', 'ver faltantes', 'imprimir faltantes', 'que me falta', 'lista de faltantes', 'reponer', 'que tengo que comprar', 'pdf faltantes', 'productos faltantes'],
      a: 'En <b>Stock</b> tocá <b>Ver faltantes</b> para filtrar solo lo que hay que reponer. Con <b>Imprimir faltantes</b> sacás el listado en PDF para hacer tu pedido.' },

    /* ───────── VENCIMIENTOS ───────── */
    { id: 'ven-cargar', modulo: 'vencimientos',
      q: '¿Cómo cargo la fecha de vencimiento de un producto?',
      kw: ['vencimiento', 'fecha de vencimiento', 'cargar vencimiento', 'poner vencimiento', 'vence', 'lote', 'caducidad', 'fecha vencimiento', 'colocar vencimiento', 'agregar vencimiento'],
      a: '1. Entrá a <b>Vencimientos</b> y tocá <b>Cargar vencimiento</b>.<br>2. En <b>Producto</b> escribí el nombre o escaneá el código y elegilo de la lista.<br>3. Poné la <b>Cantidad</b> de unidades de ese lote y la <b>Fecha de vencimiento</b>.<br>4. Elegí una opción:<br>&nbsp;• <b>Es mercadería nueva</b>: suma esas unidades al stock y anota cuándo vencen.<br>&nbsp;• <b>Ya la tengo cargada en el stock</b>: no cambia el stock, solo anota la fecha.<br>5. Tocá <b>Guardar</b>.<br><br>Si un mismo producto tiene unidades con distintas fechas, cargá un lote por cada fecha.',
      link: ['Ir a Vencimientos', '/vencimientos'] },

    { id: 'ven-estados', modulo: 'vencimientos',
      q: '¿Qué significan los colores y los cuadros de arriba en Vencimientos?',
      kw: ['colores vencimiento', 'rojo naranja amarillo', 'vencen en 7 dias', 'estado vencimiento', 'por vencer', 'vencidos', 'semaforo', 'cuadros', 'proximos a vencer'],
      a: 'Los cuadros de arriba agrupan los lotes: <b>Vencidos</b> (rojo), <b>Vencen en 7 días</b> (naranja), <b>8 a 15 días</b> (amarillo) y <b>16 a 30 días</b> (verde). Tocá un cuadro para filtrar la lista. Debajo ves también cuántas unidades son y cuánto dinero representan.<br>Con el selector <b>Mostrar</b> elegís el período (7, 15, 30, 60, 90 días o todo) y podés buscar por nombre de producto.' },

    { id: 'ven-editar', modulo: 'vencimientos',
      q: '¿Cómo corrijo una fecha o cantidad que cargué mal?',
      kw: ['corregir vencimiento', 'editar lote', 'cambiar fecha vencimiento', 'me equivoque fecha', 'modificar lote', 'corregir lote', 'error en vencimiento'],
      a: 'En <b>Vencimientos</b>, en la fila del lote tocá el <b>lápiz ✏️</b> ("Corregir fecha o cantidad"), cambiá la <b>cantidad</b> o la fecha en <b>Vence</b> y tocá <b>Guardar</b>.' },

    { id: 'ven-baja', modulo: 'vencimientos',
      q: '¿Qué hago con la mercadería vencida o que quiero tirar?',
      kw: ['tirar', 'dar de baja', 'vencido', 'mercaderia vencida', 'descartar', 'baja de lote', 'sacar vencidos', 'desechar', 'merma vencimiento'],
      a: 'En <b>Vencimientos</b>, en la fila del lote tocá el botón rojo: dice <b>Dar de baja</b> si ya venció o <b>Tirar</b> si todavía no (lo descartás antes de tiempo). Queda registrado el motivo ("Vencido" o "Descartado antes de vencer") y esas unidades salen del stock.' },

    { id: 'ven-venta', modulo: 'vencimientos',
      q: '¿Cómo descuenta el sistema los productos con vencimiento al vender?',
      kw: ['primero que vence', 'fifo', 'orden de venta', 'descuenta lote', 'anular venta lote', 'cual lote vende', 'rotacion'],
      a: 'Cuando vendés, el sistema descuenta <b>primero la mercadería que vence antes</b>. Si anulás una venta, las unidades vuelven a su lote.' },

    /* ───────── PROVEEDORES / PEDIDOS ───────── */
    /* ───────── GASTOS ───────── */
    /* ───────── PROVEEDORES (detallado, según la pantalla real) ───────── */
    { id: 'pr-nuevo', modulo: 'proveedores',
      q: '¿Cómo cargo un proveedor nuevo?',
      kw: ['nuevo proveedor', 'agregar proveedor', 'crear proveedor', 'cargar proveedor', 'alta proveedor', 'dar de alta proveedor', 'registrar proveedor', 'mayorista', 'rubro'],
      a: 'En <b>Proveedores</b> tocá <b>Nuevo Proveedor</b> y completá <b>Nombre *</b> (nombre o razón social; es lo único obligatorio). Opcionales: <b>CUIT / RUT</b>, <b>Rubro</b> (ej: Mayorista, Servicios), teléfono, email y <b>Notas</b> (condiciones de pago, datos extra). Tocá <b>Guardar</b>.<br>En la fila de cada proveedor tenés los íconos para <b>editarlo</b> o <b>eliminarlo</b>.',
      link: ['Ir a Proveedores', '/proveedores'] },

    { id: 'pr-deuda', modulo: 'proveedores',
      q: '¿Cuánto le debo a mis proveedores?',
      kw: ['deudas con proveedores', 'ver deudas de proveedores', 'deuda con proveedores', 'cuanto debo', 'saldo proveedor', 'cuentas a pagar', 'debo', 'facturado', 'pagado', 'cuanto le debo', 'proveedores con deuda', 'deuda total', 'cuenta corriente proveedor'],
      a: 'En <b>Proveedores</b>, arriba ves: <b>Total proveedores</b> (al día y con deuda), <b>Deuda total</b>, <b>Facturado (30 días)</b> y <b>Pagado (30 días)</b>. En la tabla, la columna <b>Saldo (debo)</b> muestra lo que le debés a cada uno.<br>Usá <b>Todos / Con deuda / Al día</b>, el buscador (por nombre, CUIT o rubro) y el orden (<b>A → Z</b> o <b>Mayor deuda primero</b>). Con <b>Exportar CSV</b> te bajás la lista.' },

    { id: 'pr-pagar', modulo: 'proveedores',
      q: '¿Cómo registro un pago a un proveedor?',
      kw: ['pagar proveedor', 'pago a proveedor', 'le pague', 'registrar pago proveedor', 'abonar proveedor', 'pagar factura', 'pagar deuda', 'pago parcial', 'sena', 'cuota', 'cheque'],
      a: 'En <b>Proveedores</b>, en la fila del proveedor tocá <b>Pagar</b>:<br>1. Ves la <b>Deuda actual</b>. Escribí el <b>monto</b> o tocá <b>Pagar todo</b> (abajo ves el <b>Saldo restante</b>).<br>2. En la descripción aclará cómo pagaste (ej: "Transferencia", "efectivo").<br>3. Confirmá.<br><br>El botón <b>Pagos</b> de la fila abre la <b>cuenta corriente del proveedor</b>: total facturado, total pagado, historial de movimientos y <b>Registrar nuevo pago</b> con monto, fecha, <b>forma de pago</b> (efectivo, transferencia, cheque, tarjeta, Mercado Pago) y una nota (ej: "seña", "cuota 1").' },

    { id: 'pr-recepcion', modulo: 'proveedores',
      q: '¿Cómo recibo la mercadería que llegó de un proveedor?',
      kw: ['recepcion', 'recibir mercaderia', 'llego mercaderia', 'recepcionar pedido', 'llego todo', 'ingreso de mercaderia', 'entrada de stock', 'cargar compra', 'recibi el pedido', 'recibir pedido', 'sumar stock del proveedor', 'llego parte'],
      a: '1. En <b>Proveedores</b>, en la fila del proveedor tocá <b>Pedidos</b> (ves los pedidos enviados pendientes de recepción).<br>2. Abrí el pedido y tocá <b>Recepcionar pedido</b>.<br>3. Si llegó todo, tocá <b>Llegó todo</b>. Si llegó una parte, tildá los productos que llegaron (podés ajustar la cantidad) y tocá <b>Confirmar lo seleccionado</b>.<br><br>Al confirmar, el <b>stock se suma</b> automáticamente. Por producto podés tildar <b>Actualizar</b> para pasar el <b>precio de costo</b> (y el <b>precio de venta</b>) nuevo al inventario. Si el producto lo cargaste a mano en el pedido ("Manual"), podés <b>crearlo en inventario</b> ahí mismo (con su SKU y categoría).<br>El pedido queda como <b>Recibido</b> o <b>Recibido parcial</b>.' },

    /* ───────── PEDIDOS (detallado, según la pantalla real) ───────── */
    { id: 'ped-nuevo', modulo: 'pedidos',
      q: '¿Cómo armo un pedido a un proveedor?',
      kw: ['nuevo pedido', 'armar pedido', 'crear pedido', 'hacer un pedido', 'pedido a proveedor', 'pedir mercaderia', 'lista de pedido', 'prioridad', 'urgente', 'producto manual', 'pedido semanal'],
      a: '1. En <b>Pedidos</b> tocá <b>Nuevo pedido</b>.<br>2. Poné el <b>Nombre del pedido *</b> (ej: "Pedido semanal panadería") y la <b>Prioridad</b> (Normal, 🔴 Urgente o Baja).<br>3. <b>Agregá productos del sistema</b>: buscalos por nombre o SKU.<br>4. Si no está cargado, usá <b>Ingresá un producto manual</b>: nombre, <b>P. costo</b>, <b>Cantidad</b> y <b>P. Venta</b>.<br>5. Si querés, agregá notas y guardá.<br>Después lo enviás al proveedor (preguntame "¿Cómo envío el pedido al proveedor?").',
      link: ['Ir a Pedidos', '/pedidos'] },

    { id: 'ped-enviar', modulo: 'pedidos',
      q: '¿Cómo envío el pedido al proveedor? ¿Qué pasa con la deuda?',
      kw: ['enviar a proveedor', 'enviar pedido', 'elegir proveedor', 're enviar', 'cambiar proveedor del pedido', 'mandar pedido', 'deuda del pedido', 'registrar deuda'],
      a: 'En el pedido tocá <b>Enviar a proveedor</b>, elegí el proveedor en la lista y confirmá. El pedido queda en estado <b>Enviado</b>.<br><b>Ojo:</b> al enviarlo, el sistema registra el total del pedido (cantidad × precio de costo) como <b>deuda</b> en la cuenta del proveedor (una sola vez por pedido). Por eso conviene cargar bien los precios de costo.<br>Si te equivocaste de proveedor, usá <b>Re-enviar</b> para cambiarlo. Para mandárselo, podés <b>imprimir o descargar el PDF</b> del pedido con el ícono correspondiente.' },

    { id: 'ped-estados', modulo: 'pedidos',
      q: '¿Qué significan los estados y avisos de los pedidos?',
      kw: ['estado del pedido', 'enviado', 'recibido parcial', 'recibido', 'recordatorio', 'urgentes', 'badge', 'aviso de pedidos', 'pedidos pendientes', 'numerito'],
      a: 'Un pedido puede estar <b>Enviado</b> (esperando la mercadería), <b>Recibido parcial</b> (llegó una parte) o <b>Recibido</b> (completo). Cada producto muestra <b>✓ Recibido</b> cuando llegó.<br>En Pedidos te avisa cuántos tenés con <b>recordatorio para hoy</b>, y las notificaciones suman los pedidos <b>urgentes</b>.' },

    { id: 'ped-faltantes', modulo: 'pedidos',
      q: '¿Cómo sé qué tengo que pedir (faltantes)?',
      kw: ['faltantes', 'que tengo que comprar', 'que me falta', 'reponer', 'lista de compras', 'productos sin stock', 'que pedir', 'stock bajo', 'que necesito comprar'],
      a: 'Para saber qué reponer, andá a <b>Stock</b> y tocá <b>Ver faltantes</b> (con <b>Imprimir faltantes</b> sacás el listado en PDF). En <b>Inventario</b> también podés filtrar por <b>Stock bajo</b> y <b>Sin stock</b>. Con esa lista armás un <b>Nuevo pedido</b> en esta pantalla.' },

    /* ───────── GASTOS (detallado, según la pantalla real) ───────── */
    { id: 'g-cargar', modulo: 'gastos',
      q: '¿Cómo cargo un gasto?',
      kw: ['prestamo en cuotas', 'cuota de un prestamo', 'prestamo', '12 cuotas', 'gasto unico', 'gasto', 'cargar gasto', 'nuevo gasto', 'registrar gasto', 'anotar gasto', 'pago de luz', 'alquiler', 'sueldo', 'servicio', 'egreso', 'gasto fijo', 'gasto extraordinario', 'cargar luz', 'agregar gasto'],
      a: 'En <b>Gastos</b> tocá <b>Nuevo gasto</b> y elegí el <b>Tipo de gasto</b>:<br>• <b>Mensual fijo</b> (luz, alquiler, cuota de un préstamo…): se <b>genera solo todos los meses</b>. Completá <b>Nombre *</b>, <b>Categoría</b>, <b>Monto estimado *</b>, el <b>Día de vencimiento</b> (1-31) y desde qué mes aplica. Si tiene fin, poné el <b>Límite</b>: <b>cantidad de cuotas</b> (ej: 12) o <b>fecha de corte</b>.<br>• <b>Extraordinario</b>: un gasto único de ese momento (arreglo, compra puntual). Cargás nombre, categoría, monto, fecha y, si querés, <b>N° de boleta / referencia</b>.<br>Podés agregar una <b>Nota</b>. Tocá <b>Guardar</b>.',
      link: ['Ir a Gastos', '/gastos'] },

    { id: 'g-pagar', modulo: 'gastos',
      q: '¿Cómo marco un gasto como pagado?',
      kw: ['pagar gasto', 'marcar pagado', 'registrar pago de gasto', 'pague la luz', 'pagado', 'pendiente', 'pagar todo', 'pago parcial', 'forma de pago', 'marcar como pendiente', 'ya pague'],
      a: 'En el mes que corresponde, en el gasto tocá <b>Registrar pago</b> (o <b>Pagar todo</b> para pagarlo completo). Elegí la <b>fecha de pago</b> y la <b>forma de pago</b> (efectivo, transferencia, tarjeta débito o crédito, cheque, Mercado Pago) y confirmá.<br>Podés hacer <b>pagos parciales</b>: en <b>Pagos del gasto</b> ves el <b>Historial de pagos</b> y podés <b>Registrar nuevo pago</b> o eliminar uno. Si lo marcaste pagado por error, tocá la etiqueta <b>✓ Pagado</b> para volverlo a <b>pendiente</b>.' },

    { id: 'g-ajustar', modulo: 'gastos',
      q: 'El monto real de un gasto fijo cambió este mes (ej: la luz)',
      kw: ['ajustar monto', 'monto real', 'cambio el monto', 'la luz vino mas cara', 'monto distinto', 'estimado', 'modificar monto', 'solo este mes', 'variable'],
      a: 'En el gasto tocá <b>Ajustar monto</b> y escribí el <b>Monto real de este mes</b>. Ese cambio <b>solo modifica este mes</b>: el estimado original no cambia y los meses siguientes siguen con el estimado. Para cambiar el estimado de ahí en adelante, editá el gasto fijo (lápiz ✏️).' },

    { id: 'g-arrastre', modulo: 'gastos',
      q: '¿Qué es el "Arrastre" en los gastos?',
      kw: ['arrastre', 'arrastra', 'mes anterior pendiente', 'deuda del mes pasado', 'quedo pendiente', 'se acumula', 'impago'],
      a: 'Si un <b>gasto fijo</b> quedó <b>sin pagar</b> un mes, el sistema lo <b>arrastra</b> al siguiente: lo ves con la etiqueta <b>Arrastre $…</b> sumado al mes actual, y con el enlace "Ver el mes donde quedó pendiente". Los gastos <b>extraordinarios no arrastran</b>.' },

    { id: 'g-mes', modulo: 'gastos',
      q: '¿Cómo veo cuánto gasté en el mes y qué me falta pagar?',
      kw: ['total del mes', 'resumen del mes', 'cuanto gaste', 'progreso del mes', 'mes anterior', 'mes siguiente', 'cambiar de mes', 'pendiente del mes', 'ver otro mes', 'gastos del mes'],
      a: 'La pantalla de <b>Gastos</b> muestra el mes actual con <b>Total del mes</b>, <b>Pagado</b>, <b>Pendiente</b> y la barra de <b>Progreso del mes</b>. Con las flechas de arriba pasás al mes anterior o siguiente, y <b>Ir al mes actual →</b> te devuelve a hoy.' },

    { id: 'g-categoria', modulo: 'gastos',
      q: '¿Cómo creo o edito categorías de gastos?',
      kw: ['categoria', 'categorias', 'nueva categoria', 'tipo de gasto', 'rubro', 'color', 'icono', 'gestionar categorias', 'eliminar categoria'],
      a: 'En <b>Gastos</b> tocá <b>Categorías</b> (Gestionar categorías) → <b>Nueva categoría</b>: poné el <b>Nombre</b> (ej: Servicios, Empleados), elegí un <b>Icono</b> (Servicios, Empleados, Local, Logística, Compras, Comunicación, Seguros, Impuestos, Mantenimiento o Etiqueta) y un <b>Color</b>. También podés eliminarlas desde esa lista.' },

    { id: 'g-excel', modulo: 'gastos',
      q: '¿Cómo busco gastos de otras fechas y los exporto a Excel?',
      kw: ['gastos del mes', 'buscar gastos', 'periodo', 'exportar gastos', 'gastos por fecha', 'excel gastos', 'filtro rapido', 'acceso rapido', 'este año', 'ultimos 3 meses', 'bajar gastos'],
      a: 'En el buscador de <b>Gastos</b> elegí <b>Desde / Hasta</b> (o un <b>acceso rápido</b>: Este mes, Mes anterior, Últimos 3 meses, Este año), podés escribir una descripción o categoría y tocá <b>Buscar</b>. Ves fecha, categoría, descripción, estado, monto y forma de pago. Con <b>Exportar Excel</b> te bajás lo que estás viendo.' },

    { id: 'g-imprimir', modulo: 'gastos',
      q: '¿Cómo imprimo el resumen de gastos de un mes?',
      kw: ['imprimir gastos', 'resumen de gastos', 'imprimir resumen', 'pdf gastos', 'reporte de gastos', 'resumen ejecutivo', 'contador'],
      a: 'En <b>Gastos</b> tocá <b>Imprimir</b>, elegí el mes y confirmá. El resumen incluye: lo <b>pagado</b> (con fecha, método y monto real), lo <b>pendiente</b> (con arrastres) y un <b>resumen ejecutivo</b> con totales, porcentaje pagado y distribución por categoría.' },

    { id: 'g-caja', modulo: 'gastos',
      q: '¿Los gastos se descuentan de la caja?',
      kw: ['gasto de la caja', 'sacar de la caja', 'descontar de caja', 'caja y gastos', 'pague con plata de caja', 'efectivo del cajon', 'gasto en efectivo', 'afecta la caja'],
      a: 'Los <b>gastos y la caja son registros separados</b>: cargar un gasto no mueve la plata de la caja. Si pagaste un gasto con efectivo del cajón, además cargalo en <b>Caja → Movimientos manuales</b> como <b>Retiro</b>, así el efectivo esperado del cierre cuadra.' },

    /* ───────── REPORTES / DASHBOARD (detallado, según la pantalla real) ───────── */
    { id: 'r-ver', modulo: 'reportes',
      q: '¿Dónde veo cuánto vendí y cuánto gané?',
      kw: ['que producto vende mas', 'productos mas vendidos', 'mas vendido', 'lo que mas se vende', 'top de productos', 'ranking de productos', 'cuanto vendi', 'ventas del dia', 'ventas del mes', 'reporte', 'reporte de ventas', 'total vendido', 'ganancia', 'cuanto gane', 'resumen', 'balance', 'estadistica', 'ticket promedio', 'ver ventas por periodo', 'consultar'],
      a: 'En <b>Reportes → Reporte de ventas</b> elegí el período con los botones <b>Hoy, Ayer, Esta semana, Este mes, Mes anterior</b> (o poné <b>Desde / Hasta</b>) y tocá <b>Consultar</b>. Ves:<br>• <b>Total vendido</b> y <b>Cobrado (real)</b> (este último excluye lo vendido a cuenta corriente).<br>• <b>Transacciones</b>, <b>Ticket promedio</b> y <b>Productos distintos</b>.<br>• <b>Ganancia estimada</b> (venta − costo).<br>Más abajo, las pestañas <b>Productos, Por categoría, Métodos de pago, Por departamento y Descuentos</b>. En Productos podés ordenar por: Más vendidos, Más facturación, Más ganancia ($), Mejor margen (%) o Menos ganancia / pérdida.',
      link: ['Ir a Reportes', '/reportes/ventas'] },

    { id: 'r-ganancia', modulo: 'reportes',
      q: '¿Cómo calcula el sistema la ganancia? ¿Por qué me da distinta?',
      kw: ['ganancia estimada', 'como se calcula la ganancia', 'margen', 'costo', 'ganancia mal', 'ganancia en cero', 'sin costo', 'perdida', 'ganancia rara', 'por que la ganancia'],
      a: 'La <b>Ganancia estimada</b> es <b>venta − costo</b> de cada producto vendido. Por eso depende de que tus productos tengan cargado el <b>Precio Costo</b> en Inventario: si un producto no tiene costo, su ganancia no se puede calcular bien. Para ver cuáles te dan poca ganancia o pérdida, ordená la pestaña Productos por <b>Menos ganancia / pérdida</b>.' },

    { id: 'r-descuentos', modulo: 'reportes',
      q: '¿Cómo controlo los descuentos y los precios modificados por mis empleados?',
      kw: ['descuentos aplicados', 'precios modificados', 'total resignado', 'control de descuentos', 'quien hace descuentos', 'empleado regala', 'vendedor', 'precios editados', 'cuanto descontaron', 'control de vendedores'],
      a: 'En <b>Reporte de ventas → pestaña Descuentos</b> ves cuánto se descontó en el período (<b>Descuentos aplicados</b>), cuántos <b>precios se modificaron a mano</b> y el <b>Total resignado</b> (cuánto dejaste de facturar). También lo desglosa <b>por vendedor</b>: cuántas ventas hizo, descuento general y precios editados, para detectar excesos.<br>Si querés que solo algunos puedan dar descuentos, controlalo en <b>Ajustes → Usuarios</b> (acción "Dar descuentos").' },

    { id: 'r-deudas', modulo: 'reportes',
      q: '¿Cómo veo cuánto me deben los clientes en total?',
      kw: ['total por cobrar', 'clientes con deuda', 'mayor deudor', 'cuanto me deben', 'deudas de clientes', 'cuentas corrientes abiertas', 'quien me debe', 'cobranza pendiente'],
      a: 'En el <b>Reporte de ventas</b> aparece <b>Total por cobrar</b> (suma de saldos deudores), <b>Clientes con deuda</b> y el <b>Mayor deudor</b>, con la lista de clientes, su teléfono y cuánto <b>Debe</b> cada uno (con un enlace <b>Ver cliente</b>). El detalle y los cobros se manejan en <b>Clientes</b>.' },

    { id: 'r-metodos', modulo: 'reportes',
      q: '¿Cuánto me queda realmente después de las comisiones de tarjetas?',
      kw: ['comision', 'comisiones', 'metodo de pago reporte', 'lo que te llega', 'neto', 'cuanto cobra la tarjeta', 'cuanto me queda', 'comision del banco', 'reporte por metodo', 'ventas por metodo de pago', 'mercado pago comision'],
      a: 'Entrá al <b>Reporte de Ventas por Método de Pago</b> (Dashboard → reportes), elegí <b>Desde / Hasta</b>: ves el <b>Total bruto</b>, las <b>Comisiones</b> y <b>Lo que te llega</b> (neto), con el detalle por método: transacciones, ticket promedio y <b>Comisión %</b>.<br>Las comisiones salen del porcentaje de <b>Comisión interna</b> que cargues en cada método en <b>Ajustes → Pagos</b> (lo que te cobra el banco o procesador). Si un método no tiene comisión cargada, aparece "Sin comisión".',
      link: ['Ir al reporte por método', '/dashboard/reportes/metodos'] },

    { id: 'r-excel', modulo: 'reportes',
      q: '¿Cómo exporto un reporte a Excel?',
      kw: ['excel', 'exportar', 'descargar reporte', 'xlsx', 'planilla', 'bajar datos', 'exportar reporte', 'csv', 'exportar ventas'],
      a: 'En el <b>Reporte de ventas</b>, primero tocá <b>Consultar</b> con el período que querés; después aparece el botón verde <b>Exportar .xlsx</b> y descarga lo que estás viendo. En el <b>Dashboard</b>, el gráfico de ventas de los últimos 7 días tiene un botón <b>CSV</b>. En Gastos, Historial, Clientes e Inventario también hay botones de exportar.' },

    { id: 'r-dashboard', modulo: 'general',
      q: '¿Qué muestra el Dashboard (la pantalla de inicio)?',
      kw: ['productos que no se venden', 'no se venden', 'sin rotar', 'no rotan', 'productos parados', 'mercaderia parada', 'dashboard', 'inicio', 'pantalla principal', 'resumen', 'productos estancados', 'por vencer', 'stock a reponer', 'hora de mayor venta', 'como te pagaron hoy', 'deuda a proveedores', 'vendido este mes', 'panel'],
      a: 'El <b>Dashboard</b> es tu resumen del negocio: <b>Vendido este mes</b> (y cómo va contra el mes pasado), <b>Ganancia estimada</b>, <b>Ticket promedio</b>, <b>Esta semana</b>, <b>Hora de mayor venta</b> y <b>Deuda a proveedores</b>.<br>Más abajo: ventas de los últimos 7 días, <b>En qué gasté este mes</b>, <b>Cómo te pagaron hoy</b>, <b>Productos estancados</b> (45+ días sin vender), <b>Stock a reponer</b> y lo que está <b>Por vencer</b> (próximos 15 días). Con las flechas de arriba cambiás el período.',
      link: ['Ir al Dashboard', '/dashboard'] },

    /* ───────── AJUSTES (detallado, según la pantalla real) ───────── */
    { id: 'aj-pestanas', modulo: 'ajustes',
      q: '¿Qué puedo configurar en Ajustes?',
      kw: ['ajustes', 'configuracion', 'configurar', 'que hay en ajustes', 'pestanas', 'opciones', 'donde configuro', 'solo administrador', 'preferencias'],
      a: 'Ajustes es solo para el <b>administrador</b> y tiene estas pestañas: <b>Empresa</b> (datos del negocio), <b>Logo</b>, <b>Ticket</b> (formato de impresión), <b>Usuarios</b> (accesos y permisos), <b>Pagos</b> (métodos de pago y recargos), <b>AFIP/ARCA</b> (facturación electrónica), <b>Email</b> (envío de comprobantes), <b>Balanza</b>, <b>Backups</b> (copias de seguridad) y <b>Apariencia</b> (tema claro/oscuro).',
      link: ['Ir a Ajustes', '/ajustes'] },

    { id: 'aj-empresa', modulo: 'ajustes',
      q: '¿Cómo cambio el nombre, los datos o el logo de mi negocio?',
      kw: ['logo', 'nombre de la empresa', 'nombre del negocio', 'razon social', 'datos de la empresa', 'cambiar nombre', 'direccion', 'cuit', 'ingresos brutos', 'iibb', 'inicio de actividades', 'personalizar', 'cambiar logo', 'subir logo', 'condicion iva', 'encabezado'],
      a: 'En <b>Ajustes → Empresa</b> cargás: <b>Nombre del negocio *</b>, descripción o tagline (opcional, sale debajo del nombre en el presupuesto), <b>Dirección</b>, <b>Teléfono</b>, <b>Email</b>, <b>CUIT</b> (es el mismo que se usa para AFIP/ARCA), <b>Inicio de actividades</b>, <b>Ingresos Brutos</b> y la <b>Condición IVA</b>. Guardá al terminar.<br>El <b>logo</b> se sube en <b>Ajustes → Logo</b>: arrastrá la imagen o hacé click (PNG, JPG o SVG, máx. 2 MB). Con <b>Cambiar</b> o <b>Quitar</b> lo modificás. Aparece en tickets y presupuestos.' },

    { id: 'aj-ticket', modulo: 'ajustes',
      q: '¿Cómo configuro la impresora de tickets o el mensaje del ticket?',
      kw: ['ticket', 'impresora', 'termica', '58mm', '80mm', 'a4', 'formato de impresion', 'mensaje al pie', 'gracias por su compra', 'tamano del ticket', 'ticket de prueba', 'imprime mal', 'configurar impresora', 'rollo'],
      a: 'En <b>Ajustes → Ticket</b> elegí el <b>Formato de impresión</b>: <b>Térmica 58mm</b> (comanderas chicas, ej: Gadnic IT1050), <b>Térmica 80mm</b> (impresoras de tickets con rollos) o <b>Normal A4</b> (impresora de escritorio). También podés escribir el <b>Mensaje al pie del ticket</b> (ej: "¡Gracias por su compra! Volvé pronto 😊"). A la derecha ves la <b>vista previa</b> y podés imprimir un <b>ticket de prueba</b> para verificar que sale bien.' },

    { id: 'aj-usuario', modulo: 'ajustes',
      q: '¿Cómo creo un usuario para un empleado?',
      kw: ['usuario', 'nuevo usuario', 'crear usuario', 'empleado', 'agregar empleado', 'alta usuario', 'permisos', 'rol', 'cajero', 'admin', 'dar acceso', 'nuevo empleado', 'editar usuario', 'desactivar usuario', 'secciones visibles', 'sucursal del empleado'],
      a: '1. Entrá a <b>Ajustes → Usuarios</b> y tocá <b>Nuevo usuario</b>.<br>2. Poné el <b>Nombre de usuario</b> (ej: cajero1) y el <b>Nombre visible</b> (ej: Juan Pérez).<br>3. Elegí el <b>Rol</b>: <b>Admin</b> (acceso completo) o <b>Empleado</b> (ventas y caja).<br>4. Para un empleado elegí su <b>Sucursal</b> (solo verá los productos y ventas de esa sucursal), las <b>Secciones visibles</b> y las <b>Acciones sensibles</b> (ver "¿Qué permisos puede tener un empleado?").<br>5. Cargá la <b>Contraseña</b> (mínimo 4 caracteres) y el <b>PIN</b> (4 a 6 números).<br>6. Tocá <b>Crear usuario</b>.<br>Para editar uno existente, dejá la contraseña vacía si no querés cambiarla.',
      link: ['Ir a Ajustes', '/ajustes'] },

    { id: 'aj-permisos', modulo: 'ajustes',
      q: '¿Qué permisos puede tener un empleado?',
      kw: ['permisos', 'acciones sensibles', 'que puede hacer un empleado', 'secciones', 'anular ventas', 'ver costos', 'dar descuentos', 'permiso para anular', 'no ve costos', 'no puede anular', 'no puede dar descuento', 'habilitar', 'restringir'],
      a: 'Un empleado nuevo arranca con acceso a <b>Dashboard, Ventas, Historial y Caja</b>. El administrador puede sumarle estas secciones: <b>Clientes, Presupuestos, Inventario, Stock, Proveedores y Gastos</b>.<br>Además hay <b>3 acciones sensibles</b> que empiezan <b>apagadas</b> y se habilitan una por una:<br>• <b>Anular ventas</b>: anula ventas propias y ajenas (y emite Nota de Crédito si estaban facturadas).<br>• <b>Ver costos y márgenes</b>: ve el costo y la ganancia de cada producto en Inventario.<br>• <b>Dar descuentos</b>: aplica descuentos manuales al cobrar.<br>Las pantallas de <b>Sucursales, Facturación AFIP, Auditoría, Catálogo y Ajustes</b> son solo para administradores.' },

    { id: 'aj-pin', modulo: 'ajustes',
      q: '¿Para qué sirve el PIN del usuario y cómo lo cambio?',
      kw: ['pin', 'codigo de vendedor', 'cambiar pin', 'olvide el pin', 'pin incorrecto', 'clave de vendedor', 'numero secreto', 'atender'],
      a: 'El <b>PIN</b> (4 a 6 números) lo usa cada empleado para identificarse como <b>vendedor</b> en el Punto de venta, así cada venta queda a su nombre. Lo define el administrador al crear o editar el usuario en <b>Ajustes → Usuarios</b>.' },

    { id: 'aj-pass', modulo: 'ajustes',
      q: 'Me olvidé la contraseña',
      kw: ['olvide', 'contrasena', 'clave', 'password', 'no recuerdo', 'resetear', 'cambiar contrasena', 'recuperar', 'olvide mi clave', 'olvide la contrasena', 'no puedo entrar'],
      a: 'Por seguridad, la contraseña no se puede ver. Pedile a un <b>administrador</b> que te la cambie en <b>Ajustes → Usuarios</b> (editás el usuario y escribís una nueva contraseña). Si el que la olvidó es el único administrador, hay que contactar a soporte.' },

    { id: 'aj-metodos', modulo: 'ajustes',
      q: '¿Cómo agrego un método de pago o un recargo por tarjeta?',
      kw: ['metodo de pago', 'medio de pago', 'recargo', 'nuevo metodo', 'transferencia', 'naranja x', 'comision interna', 'recargo al cliente', 'fiado', 'agregar tarjeta', 'agregar medio', 'desactivar metodo', 'efectivo vuelto'],
      a: 'En <b>Ajustes → Pagos</b> tocá <b>Nuevo Método de Pago</b>:<br>• <b>Nombre *</b> (ej: Naranja X, Clover).<br>• <b>Tipo</b>: <i>Tarjeta / Digital / Otro</i>, <i>Efectivo</i> (activa la calculadora de vuelto) o <i>Fiado</i> (registra en cuenta corriente).<br>• <b>Ícono</b> y <b>Color</b>.<br>• <b>Recargo al cliente</b> (%): se suma al total de la venta (ej: 5% con Naranja).<br>• <b>Comisión interna</b> (%): lo que te cobra el banco o procesador a vos; no afecta al cliente, se usa en los reportes.<br>Guardá. Cada método puede estar <b>Activo</b> o <b>Inactivo</b>: los activos aparecen al cobrar en el Punto de venta.' },

    { id: 'aj-afip', modulo: 'ajustes',
      q: '¿Cómo configuro la facturación electrónica de AFIP/ARCA?',
      kw: ['configurar afip', 'activar facturacion', 'certificado', 'crt', 'key', 'clave privada', 'punto de venta afip', 'homologacion', 'produccion', 'ambiente afip', 'arca', 'cuit emisor', 'facturacion electronica configuracion', 'subir certificado'],
      a: 'En <b>Ajustes → AFIP/ARCA</b>:<br>1. Activá <b>Activar facturación electrónica</b> (si está apagada, el sistema vende normal pero no usa AFIP).<br>2. <b>CUIT del emisor</b>: es el mismo que cargaste en la pestaña Empresa.<br>3. <b>Punto de venta (nro.)</b> habilitado en AFIP.<br>4. Subí el <b>certificado (.crt)</b> y la <b>clave privada (.key)</b>: <b>Elegir .crt</b>, <b>Elegir .key</b> y <b>Subir al servidor</b> (se guardan en la carpeta certs/ y se completan las rutas solas).<br>5. Elegí el <b>Ambiente</b>: <b>Homologación</b> (pruebas) o <b>Producción</b>.<br>La <b>Condición IVA del emisor</b> (que define si podés emitir A, B o C) se edita en la pestaña Empresa.<br>Si es la primera vez que generás el certificado, conviene que te asista tu contador o soporte.' },

    { id: 'aj-email', modulo: 'ajustes',
      q: '¿Cómo configuro el envío de comprobantes por email?',
      kw: ['email', 'mail', 'gmail', 'contrasena de aplicacion', 'enviar comprobante', 'no envia mails', 'correo', 'configurar correo', 'google', 'verificacion en 2 pasos', 'no manda el ticket', 'enviar por email'],
      a: 'En <b>Ajustes → Email</b> cargá tu <b>Cuenta Gmail</b> (la que enviará los mails) y una <b>Contraseña de aplicación</b>. <b>No sirve tu contraseña normal de Gmail.</b> Para generarla: entrá a myaccount.google.com → <b>Seguridad</b> → activá la <b>Verificación en 2 pasos</b> (si no está activa) → <b>Contraseñas de aplicación</b> → <b>Crear una nueva</b>, y copiá las 16 letras. Guardá. Después podés enviar tickets y facturas a tus clientes desde la venta confirmada.' },

    { id: 'aj-balanza', modulo: 'ajustes',
      q: '¿Cómo conecto una balanza electrónica?',
      kw: ['balanza', 'ean13', 'ean-13', 'plu', 'kretz', 'toledo', 'cas', 'systel', 'peso en vivo', 'etiqueta de balanza', 'prefijo', 'baudrate', 'puerto serial', 'agente local', 'balanza con codigo'],
      a: 'En <b>Ajustes → Balanza</b> elegí el <b>Tipo de conexión</b>:<br>• <b>Ticket con código de barras</b>: la balanza imprime una etiqueta EAN-13 y la escaneás. Configurá el <b>Modo</b> (Precio: los últimos 5 dígitos son el precio, lo más común; o Peso en gramos), el <b>Prefijo EAN-13</b> (normalmente 2) y los <b>Dígitos del PLU</b> (5 o 6, según el modelo).<br>• <b>Conexión directa</b>: la balanza está cableada a la PC y el peso se ve en vivo. Elegí la <b>marca</b> (Kretz, CAS, Toledo, Systel u otra), el <b>puerto</b> (serial o USB) y la <b>velocidad</b> (9600 es la más común). Requiere el <b>agente local</b> instalado en esa PC.<br>Activá <b>Activar soporte de balanza</b> y aparece el chip ⚖️ en el Punto de venta. Consultá el manual de tu balanza para los datos exactos.' },

    { id: 'aj-backup', modulo: 'ajustes',
      q: '¿Cómo hago una copia de seguridad?',
      kw: ['backup', 'copia de seguridad', 'respaldo', 'resguardar', 'guardar datos', 'restaurar', 'perder datos', 'descargar copia', 'generar copia', 'copias', 'backups'],
      a: 'En <b>Ajustes → Backups</b> tocá <b>Generar copia ahora</b>. Abajo ves la lista de copias con fecha y tamaño, y un botón <b>Descargar</b> en cada una.<br><b>No se genera nada solo</b>: vos decidís cuándo. Un buen hábito es hacer una antes de un cambio grande, o cada tanto, y <b>descargarla y guardarla en otro lugar</b> (pendrive, nube) por si falla el servidor.<br>La restauración no se hace desde esa pantalla: si necesitás recuperar datos, consultá a soporte.' },

    { id: 'aj-tema', modulo: 'ajustes',
      q: '¿Cómo cambio entre modo claro y oscuro?',
      kw: ['oscuro', 'claro', 'tema', 'dark', 'modo noche', 'color', 'apariencia', 'modo oscuro', 'modo claro', 'cambiar tema', 'fondo negro'],
      a: 'En <b>Ajustes → Apariencia</b> elegí <b>Claro</b> u <b>Oscuro</b>. El tema se aplica a todas las pantallas del sistema. (Como Ajustes es solo para administradores, si sos empleado pedile al administrador que lo cambie.)' },

    /* ───────── IMPORTAR ───────── */
    /* ───────── SUCURSALES ───────── */
    /* ───────── AFIP ───────── */
    /* ───────── AUDITORÍA / CATÁLOGO / AJUSTES ───────── */    /* ───────── IMPORTAR (ventas / gastos / catálogo) ───────── */
    { id: 'imp-como', modulo: 'importar',
      q: '¿Cómo importo ventas, gastos o productos desde mi Excel?',
      kw: ['no tengo plantilla', 'plantilla', 'importar', 'subir excel', 'cargar desde excel', 'migrar datos', 'cargar planilla', 'subir archivo', 'importar ventas', 'importar gastos', 'pasar mis datos', 'venia de otro sistema', 'excel de ventas', 'excel de gastos', 'importar historial'],
      a: '1. Entrá a <b>Importar</b> y elegí <b>¿Qué querés importar?</b>: <b>Ventas</b>, <b>Gastos</b> o <b>Catálogo (productos)</b>.<br>2. Subí tu archivo Excel (<b>no necesitás una plantilla</b>: el sistema lee tus propias columnas). Si tiene varias pestañas, elegí la <b>Hoja del archivo</b>.<br>3. Indicá <b>qué columna de tu Excel corresponde a cada campo</b>. El sistema ya sugiere lo más probable: revisalo y corregí; lo que no uses dejalo en <b>— No usar —</b>. Los campos con <b>*</b> son obligatorios.<br>&nbsp;• <b>Ventas</b>: Fecha*, Cliente, Detalle / producto, Cantidad, Precio unitario, Monto total, Medio de pago, y 2do monto / 2do medio de pago si estaba dividido, Categoría.<br>&nbsp;• <b>Gastos</b>: Fecha*, Categoría*, Monto*, Descripción, Responsable, Método de pago.<br>&nbsp;• <b>Catálogo</b>: Nombre*, Precio*, Categoría, Descripción, Stock.<br>4. Tocá <b>Previsualizar importación →</b>: ves el resumen y los avisos. <b>Hasta acá no se guardó nada.</b><br>5. Si está bien, tocá <b>✅ Confirmar e importar</b>.',
      link: ['Ir a Importar', '/importar'] },

    { id: 'imp-avisos', modulo: 'importar',
      q: '¿Qué significan los avisos de la vista previa de importación?',
      kw: ['clientes que no encontro', 'clientes no encontrados', 'avisos importacion', 'categorias nuevas', 'medios de pago que no coinciden', 'clientes que no encontramos', 'consumidor final importacion', 'vista previa', 'previsualizar', 'se van a crear', 'no coinciden'],
      a: 'Antes de confirmar, la vista previa te avisa:<br>• <b>Se van a crear estas categorías nuevas</b>: las categorías que no existían se crean solas.<br>• <b>Medios de pago que no coinciden</b> con los que tenés configurados: se guardan igual, <b>tal como están escritos</b> en tu Excel.<br>• <b>Clientes que no encontramos</b>: esas ventas quedan asignadas a <b>Consumidor Final</b> (si querés que figuren a nombre del cliente, cargalos antes en Clientes).<br>• <b>Estas filas NO se van a importar</b>: las filas con errores.<br>En Catálogo, además te dice cuántos productos con stock 0 quedan marcados como <b>Agotado</b>.' },

    { id: 'imp-error', modulo: 'importar',
      q: 'La importación me marca filas con error',
      kw: ['error importar', 'fila con error', 'no importa', 'fallo importacion', 'filas rechazadas', 'archivo invalido', 'no se importo', 'estas filas no se van a importar', 'filas con problemas', 'importo menos'],
      a: 'Las filas con error <b>no se importan</b>; el resto sí. Los motivos más comunes: falta un campo obligatorio (en <b>Gastos la categoría es obligatoria</b>, y en todos la <b>fecha</b> y el <b>monto</b>/precio), o una fecha o un monto con formato raro. Corregí esas filas en tu Excel y volvé a importar <b>solo esas</b> (para no duplicar las que ya entraron). También chequeá que hayas indicado bien qué columna es cada campo.' },

    { id: 'imp-catalogo-inv', modulo: 'importar',
      q: '¿Importar "Catálogo" es lo mismo que importar productos al Inventario?',
      kw: ['catalogo o inventario', 'importar productos', 'diferencia importar', 'donde importo productos', 'productos al inventario', 'importar al catalogo', 'excel de productos', 'importar excel inventario', 'cargar productos con stock'],
      a: 'No son lo mismo:<br>• <b>Importar → Catálogo (productos)</b> carga tu <b>vidriera digital</b> (catálogo propio para clientes). <b>No toca tu Inventario.</b><br>• Para cargar los productos que <b>vendés en el Punto de venta</b> (con stock, costo y precios), usá <b>Inventario → Importar Excel</b>.' },

    /* ───────── SUCURSALES ───────── */
    { id: 'su-cambiar', modulo: 'sucursales',
      q: '¿Cómo cambio de sucursal?',
      kw: ['sucursal', 'cambiar sucursal', 'otra sucursal', 'local', 'deposito', 'casa central', 'multi sucursal', 'cambiar de local', 'estoy en otra sucursal', 'flechas', 'no me deja cambiar de sucursal'],
      a: 'Arriba a la derecha, el botón con las <b>flechas ⇄</b> ("Cambiar sucursal") te deja elegir otra. El <b>administrador</b> puede pasar a cualquier sucursal activa. Un <b>empleado</b> solo trabaja en la sucursal que le asignaron (no puede cambiar a otra).<br>El stock, la caja y las ventas son <b>por sucursal</b>, por eso conviene fijarse en cuál estás parado antes de vender o cerrar la caja.' },

    { id: 'su-nueva', modulo: 'sucursales',
      q: '¿Cómo agrego una sucursal nueva?',
      kw: ['nueva sucursal', 'agregar sucursal', 'crear sucursal', 'abrir sucursal', 'segundo local', 'sumar sucursal', 'cargar sucursal', 'editar sucursal', 'vista consolidada', 'ventas de todas las sucursales'],
      a: 'En <b>Sucursales</b> (solo administradores) tocá <b>Agregar sucursal</b> y completá <b>Nombre del local *</b> (ej: Sucursal Norte, Casa Central), <b>Dirección</b> y <b>Teléfono</b>. Guardá. Cada sucursal tiene su botón <b>Editar</b>.<br>Como administrador ves una <b>vista consolidada</b> con las <b>ventas de hoy</b> y las <b>transacciones</b> de cada una, y en el <b>Dashboard</b> podés filtrar por sucursal.',
      link: ['Ir a Sucursales', '/sucursales'] },

    { id: 'su-eliminar', modulo: 'sucursales',
      q: '¿Qué pasa si elimino una sucursal?',
      kw: ['eliminar sucursal', 'borrar sucursal', 'cerrar sucursal', 'quitar sucursal', 'sucursal principal', 'que pasa si borro', 'no puedo eliminar sucursal'],
      a: '<b>Cuidado:</b> la <b>sucursal principal no se puede eliminar</b>. Si eliminás otra, <b>todo lo que tenía pasa a la sucursal principal</b>: sus usuarios, productos (y su stock), ventas y cajas. No se pierde nada, pero queda mezclado con lo de la principal y no se puede separar después. Antes de eliminar, asegurate de que sea lo que querés.' },

    { id: 'su-empleado', modulo: 'sucursales',
      q: '¿Cómo asigno un empleado a una sucursal?',
      kw: ['empleado en sucursal', 'asignar sucursal', 'sucursal del empleado', 'solo vea su sucursal', 'restringir por sucursal', 'cada local con su empleado'],
      a: 'Al crear o editar el usuario en <b>Ajustes → Usuarios</b>, elegí su <b>Sucursal</b>: el empleado <b>solo verá los productos y ventas de esa sucursal</b>. El administrador ve todas.' },

    /* ───────── FACTURACIÓN AFIP ───────── */
    { id: 'af-factura', modulo: 'afip',
      q: '¿Cómo emito una factura electrónica?',
      kw: ['como hago una factura', 'hacer una factura', 'factura', 'facturar', 'afip', 'factura electronica', 'cae', 'factura a', 'factura b', 'factura c', 'monotributo', 'comprobante fiscal', 'arca', 'emitir factura', 'como facturo', 'hacer una factura'],
      a: 'Hay dos momentos para facturar:<br>• <b>Al cobrar</b>: en la ventana de cobro, sección <b>Factura electrónica AFIP</b> (ver "¿Cómo emito una factura al cobrar?").<br>• <b>Después</b>: en <b>Historial</b>, abrí la venta y tocá <b>Facturar</b>.<br>El tipo que podés emitir depende de tu condición IVA (Ajustes → Empresa): <b>Responsable Inscripto</b> solo A o B; <b>Monotributista o Exento</b> solo C. Para Factura A hace falta el CUIT del cliente.<br>Todo lo emitido queda en <b>Facturación AFIP</b>. Tiene que estar activada en <b>Ajustes → AFIP/ARCA</b>.',
      link: ['Ver Facturación AFIP', '/afip/historial'] },

    { id: 'af-historial', modulo: 'afip',
      q: '¿Dónde veo las facturas que emití y cómo las descargo?',
      kw: ['historial de facturacion', 'facturas emitidas', 'ver facturas', 'buscar factura', 'pdf factura', 'copiar cae', 'exportar facturas', 'total facturado', 'comprobantes emitidos', 'descargar factura', 'libro de ventas', 'facturas del mes'],
      a: 'En <b>Facturación AFIP</b> (Historial de Facturación) ves todos los comprobantes electrónicos emitidos. Podés <b>buscar</b> por cliente, CUIT, CAE o número, filtrar por tipo (<b>Factura A, B o C</b>) y ordenar (más recientes, más antiguas, mayor o menor importe). Arriba están los totales: <b>Comprobantes</b>, <b>Total facturado</b> y <b>Factura B / C</b>.<br>La tabla muestra fecha, tipo, comprobante, cliente, CUIT, importe, vencimiento del CAE y la venta asociada. En <b>Acciones</b> bajás el <b>PDF</b> o copiás el <b>CAE</b>. Con <b>Exportar Excel</b> te llevás el listado (útil para tu contador).<br>Si ves "Facturación deshabilitada", activala en <b>Ajustes → AFIP/ARCA</b>.' },

    { id: 'af-error', modulo: 'afip',
      q: 'La factura da error / AFIP la rechaza',
      kw: ['error afip', 'no factura', 'no responde', 'rechazada', 'certificado', 'cae no', 'afip caido', 'error al facturar', 'no emite', 'afip rechazo el comprobante', 'punto de venta no habilitado', 'cuit no valido', 'factura a cuit', 'ya tiene factura', 'periodo facturado', 'probar conexion'],
      a: 'Fijate qué mensaje te muestra:<br>• <b>"La facturación electrónica está deshabilitada"</b> → activala en Ajustes → AFIP/ARCA.<br>• <b>"CUIT no configurado"</b>, <b>"Certificado no encontrado"</b>, <b>"Clave privada no encontrada"</b> o <b>"No se encontró un certificado PEM válido"</b> → revisá la pestaña AFIP/ARCA y volvé a subir el .crt y el .key. Usá <b>Probar conexión con AFIP</b> para verificar.<br>• <b>"El punto de venta N no está habilitado en ARCA"</b> → el número de punto de venta no coincide con el habilitado en AFIP; confirmalo con tu contador.<br>• <b>"Un emisor Responsable Inscripto solo puede emitir A o B"</b> / <b>"Monotributista … solo C"</b> → elegiste un tipo que no corresponde a tu condición IVA.<br>• <b>"Para Factura A debés informar CUIT del cliente"</b> o <b>"El CUIT del cliente no es válido"</b> → revisá el CUIT.<br>• <b>"Para facturar un servicio hay que indicar el período"</b> → tildá "Es un servicio" y cargá fecha desde/hasta.<br>• <b>"Esta venta ya tiene factura emitida"</b> → no se puede facturar dos veces (buscala en Facturación AFIP).<br>• <b>"AFIP rechazó el comprobante: …"</b> → AFIP explica el motivo en el mismo mensaje. Si el servicio de AFIP está caído, reintentá en unos minutos.<br>• <b>"Alícuota IVA no soportada"</b> o error en el IVA de un ítem → revisá el IVA del producto en Inventario (0%, 2,5%, 5%, 10,5%, 21% o 27%).' },

    { id: 'af-nc', modulo: 'afip',
      q: '¿Cómo se hace una nota de crédito?',
      kw: ['nota de credito', 'nc', 'anular factura', 'devolucion facturada', 'factura anulada', 'ya se emitio la nota de credito', 'anular venta facturada', 'cancelar factura'],
      a: 'No hace falta hacerla a mano: al <b>anular una venta que estaba facturada</b> (Historial → Anular venta), el sistema <b>emite solo la Nota de Crédito</b> ante AFIP. Solo la puede emitir quien tenga el permiso <b>Anular ventas</b>. Si ya se había emitido, te avisa el número ("Ya se emitió la Nota de Crédito N° …"). Una venta sin factura no genera nota de crédito.' },

    /* ───────── AUDITORÍA ───────── */
    { id: 'au-ver', modulo: 'auditoria',
      q: '¿Qué es Auditoría y cómo la uso?',
      kw: ['ver inicios de sesion', 'quien inicio sesion', 'quien entro al sistema', 'inicios de sesion', 'auditoria', 'quien hizo', 'registro de cambios', 'bitacora', 'log', 'quien anulo', 'quien borro', 'movimientos de usuarios', 'control', 'quien cambio el precio', 'eventos', 'inicios de sesion', 'historial de cambios'],
      a: '<b>Auditoría</b> (solo administradores) registra <b>quién hizo qué</b> en el sistema. En la pestaña <b>Eventos</b> filtrás por:<br>• <b>Tipo de evento</b>: Movimientos de stock, Ventas anuladas, Precios cambiados a mano (POS), Descuentos aplicados, Cierres de caja, Altas de producto, Precios editados (Inventario), Bajas de producto, Cambios en Ajustes, PIN incorrecto e Inicios de sesión.<br>• <b>Usuario</b> (por nombre) y <b>Desde / Hasta</b>, o los accesos rápidos <b>Esta semana, Este mes, Mes pasado, Este año, Todo</b>.<br>Tocá <b>Filtrar</b> (o <b>Limpiar</b>) y, si querés, <b>Exportar Excel</b>.',
      link: ['Ir a Auditoría', '/auditoria'] },

    { id: 'au-control', modulo: 'auditoria',
      q: '¿Cómo detecto si alguien anula ventas, regala descuentos o toca precios?',
      kw: ['quien anulo una venta', 'quien anulo', 'quien borro una venta', 'quien cambio el precio', 'detectar fraude', 'robo', 'quien anulo ventas', 'quien dio descuentos', 'quien cambio precios', 'controlar empleados', 'pin incorrecto', 'intentos de pin', 'sospecho', 'ventas anuladas', 'precios cambiados a mano', 'empleado anula', 'faltante de plata'],
      a: 'En <b>Auditoría → Eventos</b> filtrá por <b>Ventas anuladas</b>, <b>Precios cambiados a mano (POS)</b>, <b>Descuentos aplicados</b> o <b>PIN incorrecto</b> y, si querés, por <b>Usuario</b>. Ves quién lo hizo, cuándo y el detalle. También sirven los <b>Cierres de caja</b> y los <b>Movimientos de stock</b> para ver ajustes manuales. Para limitar lo que cada empleado puede hacer, usá los permisos de Ajustes → Usuarios.' },

    { id: 'au-rentabilidad', modulo: 'auditoria',
      q: '¿Qué muestra la pestaña Rentabilidad?',
      kw: ['cuanto gane por categoria', 'gane por categoria', 'rentabilidad', 'ganancia real', 'margen promedio', 'costo de lo vendido', 'cuanto vale mi mercaderia', 'margen por categoria', 'que categoria deja mas', 'ganancia por categoria', 'unidades vendidas'],
      a: 'En <b>Auditoría → Rentabilidad</b> elegís el período y ves: <b>Unidades vendidas</b>, <b>Costo de lo vendido</b>, <b>Total vendido</b>, <b>Ganancia real (venta − costo)</b> y <b>Margen promedio</b>. Más abajo, el desglose <b>por categoría</b> (costo total, venta total y margen). Depende de que tus productos tengan el <b>costo</b> cargado en Inventario.' },

    /* ───────── CATÁLOGO / VIDRIERA DIGITAL ───────── */
    { id: 'ca-vidriera', modulo: 'catalogo',
      q: '¿Qué es el catálogo / la vidriera digital y cómo lo comparto?',
      kw: ['ocultar precios', 'no mostrar precios', 'sin precios', 'catalogo', 'vidriera', 'tienda online', 'pedidos online', 'catalogo publico', 'link para clientes', 'compartir catalogo', 'link del catalogo', 'activar catalogo', 'no disponible', 'mostrar precios', 'catalogo sin precios', 'servicios sin precio', 'apagar catalogo'],
      a: 'Es una <b>página web con tus productos</b> para que tus clientes la vean y armen su pedido desde el celular, sin iniciar sesión. En <b>Catálogo → Catálogo digital</b>:<br>• <b>Catálogo activado para tus clientes</b>: si lo apagás, el link muestra "no disponible".<br>• <b>Mostrar precios</b>: desactivalo si vendés servicios (ej: peluquería).<br>• <b>Link para compartir</b>: tocá <b>Copiar</b> y mandalo por WhatsApp o redes.<br>Arriba ves <b>cómo se está usando el catálogo</b>.',
      link: ['Ir a Catálogo', '/catalogo'] },

    { id: 'ca-origen', modulo: 'catalogo',
      q: '¿De dónde salen los productos del catálogo?',
      kw: ['catalogo propio', 'desde mi inventario', 'ambos combinados', 'publicar en la vidriera', 'productos del catalogo', 'de donde salen', 'inventario en el catalogo', 'mostrar mi inventario online', 'elegir que productos se ven'],
      a: 'Elegís una de tres opciones en <b>¿De dónde salen los productos del catálogo?</b>:<br>• <b>Catálogo propio</b>: solo los productos que cargues en esa pantalla. No toca tu Inventario.<br>• <b>Desde mi Inventario</b>: usa los productos de Inventario que tengan activado el interruptor <b>"Publicar en la vidriera"</b> (se activa producto por producto).<br>• <b>Ambos combinados</b>: junta los de Inventario (publicados) más los que cargues a mano en el catálogo.' },

    { id: 'ca-producto', modulo: 'catalogo',
      q: '¿Cómo cargo un producto en el catálogo (con fotos, variantes u ofertas)?',
      kw: ['producto del catalogo', 'nuevo producto catalogo', 'cargar producto catalogo', 'variantes', 'color', 'talle', 'fotos adicionales', 'galeria', 'agotado', 'promocion catalogo', 'precio tachado', 'foto principal', 'importar desde excel catalogo', 'opciones del producto'],
      a: 'En <b>Catálogo → Productos del catálogo</b> tocá <b>Nuevo producto</b>:<br>• <b>Nombre</b> (ej: Coca Cola 2L), <b>Categoría</b>, <b>Precio</b> y <b>Descripción</b> (medidas, colores, usos…).<br>• <b>En promoción</b>: muestra el precio tachado y la oferta; cargá el <b>Precio de promoción</b>.<br>• <b>Agotado</b>: se ve en el catálogo pero no se puede agregar al pedido.<br>• <b>Variantes (opcional)</b>: tocá <b>Agregar grupo de variantes</b>, poné el nombre (ej: Color) y las opciones separadas por coma (Rubio, Negro, Castaño). El cliente elige una de cada grupo antes de pedir.<br>• <b>Foto principal</b> y hasta <b>5 fotos adicionales</b>.<br>Tocá <b>Guardar producto</b>. Para subir muchos de una, usá <b>Importar desde Excel</b> (preguntame cómo).' },

    { id: 'ca-personalizar', modulo: 'catalogo',
      q: '¿Cómo personalizo el catálogo (colores, portada, banners, WhatsApp)?',
      kw: ['personalizar catalogo', 'color del catalogo', 'portada', 'banner', 'promociones', 'whatsapp del negocio', 'mensaje inicial', 'foto del local', 'carrusel', 'colores', 'cambiar fondo', 'diseno del catalogo', 'numero de whatsapp'],
      a: 'En <b>Catálogo → Personalización</b> podés cargar:<br>• <b>WhatsApp del negocio</b>: con código de país y sin el +, ej: <b>5493834000000</b>. Es donde llegan los pedidos.<br>• <b>Mensaje inicial del pedido por WhatsApp</b>.<br>• <b>Color principal</b> (botones, pestañas activas y precios) y <b>Color de fondo</b>.<br>• <b>Foto de portada</b> (foto del local).<br>Tocá <b>Guardar cambios</b>.<br>El <b>Banner de promociones</b> es un carrusel de imágenes sueltas (promos o novedades) debajo de la portada: <b>Agregar imagen</b>. No están atadas a ningún producto.' },

    { id: 'ca-pedidos', modulo: 'catalogo',
      q: '¿Cómo manejo los pedidos que llegan del catálogo?',
      kw: ['pedidos recibidos', 'pedidos del catalogo', 'pedido nuevo', 'atendido', 'descartar pedido', 'llegaron pedidos', 'pedidos online', 'marcar atendido', 'pedidos de clientes'],
      a: 'En <b>Catálogo → Pedidos recibidos</b> ves los pedidos de tus clientes y podés filtrarlos: <b>Todos, Nuevos, Atendidos o Descartados</b>. Cuando lo resolvés, tocá <b>Atendido</b>; si no corresponde, <b>Descartar</b>. Si no hay ninguno, aparece "No hay pedidos para mostrar".' },
  ],

  /* Charla básica */
  saludos: ['hola', 'buenas', 'buen dia', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'que tal'],
  gracias: ['gracias', 'genial', 'perfecto', 'excelente', 'joya', 'buenisimo', 'dale', 'listo', 'ok', 'muchas gracias']
};
