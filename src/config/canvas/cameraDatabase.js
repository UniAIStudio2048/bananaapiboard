import { t as translateUi } from '../../i18n/index.js'
/**
 * 相机与镜头数据库
 * 所有数据基于真实世界的设备规格
 * 涵盖近30年（1995-2025）代表性设备
 * 
 * 类别：
 * - FILM: 胶片电影机
 * - DIGITAL: 数字电影机
 * - CAMERA: 照相机（单反/无反/胶片/中画幅）
 * - PHONE: 手机
 */

export const cameraDatabase = {
  // ==================== 相机类型 ====================
  cameraTypes: [
    { id: 'FILM', get name() { return translateUi('uiMessages.mb475517b56bf') }, nameEn: 'FILM', icon: '🎞️' },
    { id: 'DIGITAL', get name() { return translateUi('uiMessages.m10f19981cb1d') }, nameEn: 'DIGITAL', icon: '📹' },
    { id: 'CAMERA', get name() { return translateUi('uiMessages.m27efc235b012') }, nameEn: 'CAMERA', icon: '📷' },
    { id: 'PHONE', get name() { return translateUi('uiMessages.m2e07333c8c74') }, nameEn: 'PHONE', icon: '📱' }
  ],

  // ==================== 电影机 ====================
  cameras: [
    // =========================================================
    // ===== 胶片电影机 (FILM) - 35mm/Super 35 =====
    // =========================================================
    
    // ----- ARRI 胶片机系列 -----
    {
      id: 'arriflex-35-iii',
      name: 'Arriflex 35-III',
      get nameCn() { return translateUi('uiMessages.m97e085c1d534') },
      type: 'FILM',
      year: 1979,
      format: 'Super 35mm Film',
      get sensor() { return translateUi('uiMessages.ma23303b0c536') },
      get description() { return translateUi('uiMessages.m41267fc849a5') },
      get famousFilms() { return [translateUi('uiMessages.m3b0c5e6c525b'), translateUi('uiMessages.m0f6a6644bfb7'), translateUi('uiMessages.mc5f323559d15'), translateUi('uiMessages.md1298c29527d')] },
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'panavision-primo', 'canon-k35']
    },
    {
      id: 'arriflex-435',
      name: 'Arriflex 435',
      get nameCn() { return translateUi('uiMessages.m64f1a4d2c2db') },
      type: 'FILM',
      year: 1995,
      format: 'Super 35mm Film',
      get sensor() { return translateUi('uiMessages.ma23303b0c536') },
      get description() { return translateUi('uiMessages.md0381d45eeed') },
      get famousFilms() { return [translateUi('uiMessages.md78c52b611de'), translateUi('uiMessages.m71682d2230d5'), translateUi('uiMessages.m3c3b9b1f2254'), translateUi('uiMessages.mf6664ff7242f')] },
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'cooke-s5', 'arri-master-anamorphic']
    },
    {
      id: 'arriflex-535b',
      name: 'Arriflex 535B',
      get nameCn() { return translateUi('uiMessages.m1b80bc004caf') },
      type: 'FILM',
      year: 1992,
      format: 'Super 35mm Film',
      get sensor() { return translateUi('uiMessages.ma23303b0c536') },
      get description() { return translateUi('uiMessages.m45b7466e889b') },
      get famousFilms() { return [translateUi('uiMessages.m3a500a9c3cea'), translateUi('uiMessages.mc517ef3b4372'), translateUi('uiMessages.mc92732cedeb9'), translateUi('uiMessages.m2c972b2699e0')] },
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'cooke-s5', 'arri-master-anamorphic', 'panavision-primo']
    },
    {
      id: 'arricam-lt',
      name: 'Arricam LT',
      get nameCn() { return translateUi('uiMessages.mcd20da5e51db') },
      type: 'FILM',
      year: 2000,
      format: 'Super 35mm Film',
      get sensor() { return translateUi('uiMessages.ma23303b0c536') },
      get description() { return translateUi('uiMessages.m4c9830c68c83') },
      get famousFilms() { return [translateUi('uiMessages.mf112904a17f8'), translateUi('uiMessages.m28f3375baa9b'), translateUi('uiMessages.ma01d346a0f75'), translateUi('uiMessages.mdf29b733c2f1')] },
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'cooke-s5', 'arri-master-anamorphic', 'panavision-primo', 'canon-k35']
    },
    {
      id: 'arricam-st',
      name: 'Arricam ST',
      get nameCn() { return translateUi('uiMessages.m709878ff71af') },
      type: 'FILM',
      year: 2000,
      format: 'Super 35mm Film',
      get sensor() { return translateUi('uiMessages.ma23303b0c536') },
      get description() { return translateUi('uiMessages.me79f12362944') },
      get famousFilms() { return [translateUi('uiMessages.m8d49d7ba6606'), translateUi('uiMessages.m186780ae7062'), translateUi('uiMessages.m52a257f71c07'), translateUi('uiMessages.m513dcc3f890b'), translateUi('uiMessages.m8dd916d3db2b')] },
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'cooke-s5', 'arri-master-anamorphic', 'panavision-primo', 'canon-k35']
    },
    {
      id: 'arriflex-16sr3',
      name: 'Arriflex 16SR3',
      get nameCn() { return translateUi('uiMessages.mc21fbd8c8880') },
      type: 'FILM',
      year: 1992,
      format: 'Super 16mm Film',
      get sensor() { return translateUi('uiMessages.mc46f6e802f1c') },
      get description() { return translateUi('uiMessages.m120cce5b3470') },
      get famousFilms() { return [translateUi('uiMessages.m5a41c5f766b9'), translateUi('uiMessages.m833728fd068c'), translateUi('uiMessages.m82f41b69a152'), translateUi('uiMessages.m6579da5fb4d5')] },
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-ultra-prime', 'cooke-s4', 'zeiss-ultra-16']
    },
    
    // ----- Panavision 胶片机系列 -----
    {
      id: 'panaflex-gold-ii',
      name: 'Panaflex Gold II',
      get nameCn() { return translateUi('uiMessages.mf813bb076c6b') },
      type: 'FILM',
      year: 1982,
      format: 'Super 35mm Film',
      get sensor() { return translateUi('uiMessages.ma23303b0c536') },
      get description() { return translateUi('uiMessages.m430544312931') },
      get famousFilms() { return [translateUi('uiMessages.mdf1af754d3a1'), translateUi('uiMessages.m4ebbd8cc0075'), translateUi('uiMessages.m8f2bd0a71f95'), translateUi('uiMessages.m75482a3c0107'), translateUi('uiMessages.mb787b108479c')] },
      compatibleMounts: ['PV'],
      compatibleLenses: ['panavision-primo', 'panavision-primo-70', 'panavision-anamorphic-e', 'panavision-anamorphic-g']
    },
    {
      id: 'panaflex-millennium',
      name: 'Panaflex Millennium',
      get nameCn() { return translateUi('uiMessages.m2c3f27d27af3') },
      type: 'FILM',
      year: 1997,
      format: 'Super 35mm Film',
      get sensor() { return translateUi('uiMessages.ma23303b0c536') },
      get description() { return translateUi('uiMessages.m40cc1577dc2c') },
      get famousFilms() { return [translateUi('uiMessages.m76f9cf89e341'), translateUi('uiMessages.mca0a58c68b72'), translateUi('uiMessages.mefab9cf076ef'), translateUi('uiMessages.m8ff06cde33fc')] },
      compatibleMounts: ['PV'],
      compatibleLenses: ['panavision-primo', 'panavision-primo-70', 'panavision-anamorphic-e', 'panavision-anamorphic-g']
    },
    {
      id: 'panavision-millennium-xl',
      name: 'Panavision Millennium XL',
      get nameCn() { return translateUi('uiMessages.m183ee103bc24') },
      type: 'FILM',
      year: 2000,
      format: 'Super 35mm Film',
      get sensor() { return translateUi('uiMessages.ma23303b0c536') },
      get description() { return translateUi('uiMessages.m4e1ac0cde220') },
      get famousFilms() { return [translateUi('uiMessages.m49352b77da67'), translateUi('uiMessages.m513dcc3f890b'), translateUi('uiMessages.mdf29b733c2f1'), translateUi('uiMessages.mc9ed13e4fd3e')] },
      compatibleMounts: ['PV'],
      compatibleLenses: ['panavision-primo', 'panavision-primo-70', 'panavision-anamorphic-e', 'panavision-anamorphic-g']
    },
    {
      id: 'panavision-millennium-xl2',
      name: 'Panavision Millennium XL2',
      get nameCn() { return translateUi('uiMessages.mb81e69c02837') },
      type: 'FILM',
      year: 2004,
      format: 'Super 35mm Film',
      get sensor() { return translateUi('uiMessages.ma23303b0c536') },
      get description() { return translateUi('uiMessages.me1137196e52e') },
      get famousFilms() { return [translateUi('uiMessages.m5f770916a310'), translateUi('uiMessages.m8a94bfabcb44'), translateUi('uiMessages.m50d1aad15d71'), translateUi('uiMessages.m383f372ff3d4'), translateUi('uiMessages.mb651da7324da')] },
      compatibleMounts: ['PV'],
      compatibleLenses: ['panavision-primo', 'panavision-primo-70', 'panavision-anamorphic-e', 'panavision-anamorphic-g']
    },
    
    // ----- Moviecam 系列 -----
    {
      id: 'moviecam-compact',
      name: 'Moviecam Compact',
      get nameCn() { return translateUi('uiMessages.me67616a8f8b1') },
      type: 'FILM',
      year: 1990,
      format: 'Super 35mm Film',
      get sensor() { return translateUi('uiMessages.ma23303b0c536') },
      get description() { return translateUi('uiMessages.me122b3c76126') },
      get famousFilms() { return [translateUi('uiMessages.m3a500a9c3cea'), translateUi('uiMessages.m2c972b2699e0'), translateUi('uiMessages.md583d1538de3')] },
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'panavision-primo']
    },
    {
      id: 'moviecam-super-america',
      name: 'Moviecam Super America',
      get nameCn() { return translateUi('uiMessages.m822835702348') },
      type: 'FILM',
      year: 1993,
      format: 'Super 35mm Film',
      get sensor() { return translateUi('uiMessages.ma23303b0c536') },
      get description() { return translateUi('uiMessages.m6e28b833deca') },
      get famousFilms() { return [translateUi('uiMessages.m4ebbd8cc0075'), translateUi('uiMessages.me8433a30d2c9'), translateUi('uiMessages.m119bd1ba63ec')] },
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'panavision-primo']
    },
    
    // ----- Aaton 系列 -----
    {
      id: 'aaton-xtr-prod',
      name: 'Aaton XTR Prod',
      get nameCn() { return translateUi('uiMessages.mfddc4a3a4a29') },
      type: 'FILM',
      year: 1990,
      format: 'Super 16mm Film',
      get sensor() { return translateUi('uiMessages.mc46f6e802f1c') },
      get description() { return translateUi('uiMessages.maf9aa6ea74cb') },
      get famousFilms() { return [translateUi('uiMessages.mb310a7666785'), translateUi('uiMessages.m872fbc966eb5'), translateUi('uiMessages.ma30b11950cdb'), translateUi('uiMessages.m6de4295b1ef4')] },
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-ultra-prime', 'zeiss-ultra-16', 'cooke-s4']
    },
    {
      id: 'aaton-35-iii',
      name: 'Aaton 35-III',
      get nameCn() { return translateUi('uiMessages.m691a592cd5a0') },
      type: 'FILM',
      year: 1999,
      format: 'Super 35mm Film',
      get sensor() { return translateUi('uiMessages.ma23303b0c536') },
      get description() { return translateUi('uiMessages.m8ec47f902691') },
      get famousFilms() { return [translateUi('uiMessages.m33cd787d79b7'), translateUi('uiMessages.m013d70951195'), translateUi('uiMessages.m3a3d55010fab')] },
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4']
    },
    {
      id: 'aaton-penelope',
      name: 'Aaton Penelope',
      get nameCn() { return translateUi('uiMessages.ma851b3d41dba') },
      type: 'FILM',
      year: 2008,
      format: 'Super 35mm Film',
      get sensor() { return translateUi('uiMessages.ma23303b0c536') },
      get description() { return translateUi('uiMessages.m94f153e6681e') },
      get famousFilms() { return [translateUi('uiMessages.m8104520f6e69'), translateUi('uiMessages.m5ae6370d9aff')] },
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'cooke-s5']
    },
    
    // ----- 经典/复古胶片机 -----
    {
      id: 'mitchell-bncr',
      name: 'Mitchell BNCR',
      get nameCn() { return translateUi('uiMessages.m50c65ea8457d') },
      type: 'FILM',
      year: 1967,
      format: '35mm Film (Academy)',
      get sensor() { return translateUi('uiMessages.mfc94fa3cb47c') },
      get description() { return translateUi('uiMessages.mccef820d48f8') },
      get famousFilms() { return [translateUi('uiMessages.m8876274d2b02'), translateUi('uiMessages.m94fa24b34d78'), translateUi('uiMessages.m60c1dcfcfd3c'), translateUi('uiMessages.m6fbe254e5017'), translateUi('uiMessages.m3d340adde3e2'), translateUi('uiMessages.mc5df7b922ac4')] },
      compatibleMounts: ['Mitchell'],
      compatibleLenses: ['cooke-speed-panchro', 'bausch-lomb-baltar']
    },
    {
      id: 'eclair-npr',
      name: 'Éclair NPR',
      get nameCn() { return translateUi('uiMessages.m74bb57c959f3') },
      type: 'FILM',
      year: 1963,
      format: '16mm Film',
      get sensor() { return translateUi('uiMessages.m8c65bcae83b8') },
      get description() { return translateUi('uiMessages.mba62143e727d') },
      get famousFilms() { return [translateUi('uiMessages.m367d29edcfbd'), translateUi('uiMessages.m30414754dba0'), translateUi('uiMessages.m201d890d0cb2'), translateUi('uiMessages.m04d6896e3f5d')] },
      compatibleMounts: ['C-Mount', 'Eclair'],
      compatibleLenses: ['angenieux-zoom', 'zeiss-ultra-16']
    },
    {
      id: 'bolex-h16',
      name: 'Bolex H16 Reflex',
      get nameCn() { return translateUi('uiMessages.m0c72c84da1f0') },
      type: 'FILM',
      year: 1956,
      format: '16mm Film',
      get sensor() { return translateUi('uiMessages.m8c65bcae83b8') },
      get description() { return translateUi('uiMessages.me69e2f851dd8') },
      get famousFilms() { return [translateUi('uiMessages.m82d0a86e6164'), translateUi('uiMessages.m37b5f3d66aac'), translateUi('uiMessages.mfbff48431555')] },
      compatibleMounts: ['C-Mount'],
      compatibleLenses: ['switar-16', 'kern-macro']
    },
    {
      id: 'bell-howell-2709',
      name: 'Bell & Howell 2709',
      get nameCn() { return translateUi('uiMessages.me9743e8db19c') },
      type: 'FILM',
      year: 1912,
      format: '35mm Film',
      get sensor() { return translateUi('uiMessages.mfc94fa3cb47c') },
      get description() { return translateUi('uiMessages.m06f8c795110f') },
      get famousFilms() { return [translateUi('uiMessages.m06d4d6432897'), translateUi('uiMessages.m8f1a08519c24'), translateUi('uiMessages.m03491fcc151f'), translateUi('uiMessages.m1b9a1a20c9b8')] },
      compatibleMounts: ['Bell-Howell'],
      compatibleLenses: ['cooke-speed-panchro', 'bausch-lomb-baltar']
    },
    
    // ----- 65mm/IMAX 胶片机 -----
    {
      id: 'panavision-system-65',
      name: 'Panavision System 65',
      get nameCn() { return translateUi('uiMessages.m92fdce5938a0') },
      type: 'FILM',
      year: 1988,
      format: '65mm Film (5-perf)',
      get sensor() { return translateUi('uiMessages.m8817b666165e') },
      get description() { return translateUi('uiMessages.m195c2ee9ec1a') },
      get famousFilms() { return [translateUi('uiMessages.mb119e1078243'), translateUi('uiMessages.mb651da7324da'), translateUi('uiMessages.m383f372ff3d4'), translateUi('uiMessages.m91666019e8de')] },
      compatibleMounts: ['PV65'],
      compatibleLenses: ['panavision-primo-70', 'panavision-system-65']
    },
    {
      id: 'imax-msm-9802',
      name: 'IMAX MSM 9802',
      get nameCn() { return translateUi('uiMessages.m63d629343585') },
      type: 'FILM',
      year: 1998,
      format: '65mm IMAX (15-perf)',
      get sensor() { return translateUi('uiMessages.m8c7f5019dc98') },
      get description() { return translateUi('uiMessages.mc25a183f4855') },
      get famousFilms() { return [translateUi('uiMessages.m50d1aad15d71'), translateUi('uiMessages.m8a94bfabcb44'), translateUi('uiMessages.m90e18bd9310d'), translateUi('uiMessages.m5c3b3451481b'), translateUi('uiMessages.ma01d346a0f75')] },
      compatibleMounts: ['IMAX'],
      compatibleLenses: ['imax-prime', 'hasselblad-hc']
    },
    {
      id: 'arri-765',
      name: 'ARRI 765',
      get nameCn() { return translateUi('uiMessages.m1c2cfe0ba8e5') },
      type: 'FILM',
      year: 1989,
      format: '65mm Film (5-perf)',
      get sensor() { return translateUi('uiMessages.m8817b666165e') },
      get description() { return translateUi('uiMessages.md28633545eab') },
      get famousFilms() { return [translateUi('uiMessages.m50d1aad15d71'), translateUi('uiMessages.me1d56b833fbe'), translateUi('uiMessages.m05ea84bcba22'), translateUi('uiMessages.mef35aff41dd4')] },
      compatibleMounts: ['PL65'],
      compatibleLenses: ['arri-prime-65', 'panavision-system-65']
    },

    // =========================================================
    // ===== 数字电影机 (DIGITAL) =====
    // =========================================================
    
    // ----- ARRI 数字机系列 -----
    {
      id: 'arri-alexa-classic',
      name: 'ARRI Alexa Classic',
      get nameCn() { return translateUi('uiMessages.md015ae99293f') },
      type: 'DIGITAL',
      year: 2010,
      format: 'Super 35 (2.8K)',
      get sensor() { return translateUi('uiMessages.mb127296855aa') },
      get description() { return translateUi('uiMessages.m98b86f8329e8') },
      get famousFilms() { return [translateUi('uiMessages.m553daff18fda'), translateUi('uiMessages.mb716306e6644'), translateUi('uiMessages.m8104520f6e69'), translateUi('uiMessages.m314c5778845d'), translateUi('uiMessages.m9882f2782b19')] },
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'cooke-s5', 'panavision-primo']
    },
    {
      id: 'arri-alexa-plus',
      name: 'ARRI Alexa Plus',
      get nameCn() { return translateUi('uiMessages.mc36b85f7bd5c') },
      type: 'DIGITAL',
      year: 2010,
      format: 'Super 35 (2.8K)',
      get sensor() { return translateUi('uiMessages.mb127296855aa') },
      get description() { return translateUi('uiMessages.mae198ff0a5bc') },
      get famousFilms() { return [translateUi('uiMessages.m63166b25bffd'), translateUi('uiMessages.mb6230a1dc3fc'), translateUi('uiMessages.m2c6b952b8f23'), translateUi('uiMessages.mdff29275a884')] },
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'cooke-s5', 'panavision-primo']
    },
    {
      id: 'arri-alexa-xt',
      name: 'ARRI Alexa XT',
      get nameCn() { return translateUi('uiMessages.m2e6b47100cf2') },
      type: 'DIGITAL',
      year: 2013,
      format: 'Super 35 (3.4K)',
      get sensor() { return translateUi('uiMessages.mbf793c743dcc') },
      get description() { return translateUi('uiMessages.md3dec1c29edc') },
      get famousFilms() { return [translateUi('uiMessages.m3227c93bec35'), translateUi('uiMessages.meba131e95324'), translateUi('uiMessages.m0f8cc720f5e6'), translateUi('uiMessages.m484b70ae04e1')] },
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'arri-master-anamorphic', 'panavision-anamorphic-e']
    },
    {
      id: 'arri-alexa-sxt',
      name: 'ARRI Alexa SXT',
      get nameCn() { return translateUi('uiMessages.mef1f0f4e1b90') },
      type: 'DIGITAL',
      year: 2016,
      format: 'Super 35 (3.4K)',
      get sensor() { return translateUi('uiMessages.m3c91b3caaa07') },
      get description() { return translateUi('uiMessages.me8afaf683757') },
      get famousFilms() { return [translateUi('uiMessages.made8f21dcd0b'), translateUi('uiMessages.m1f7eab03f51b'), translateUi('uiMessages.m482bd7a6429c'), translateUi('uiMessages.m50d1aad15d71'), translateUi('uiMessages.md1b107050671')] },
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'cooke-s5', 'arri-master-anamorphic']
    },
    {
      id: 'arri-alexa-mini',
      name: 'ARRI Alexa Mini',
      get nameCn() { return translateUi('uiMessages.m8f1d22b6800e') },
      type: 'DIGITAL',
      year: 2015,
      format: 'Super 35 (3.4K)',
      get sensor() { return translateUi('uiMessages.m3c91b3caaa07') },
      get description() { return translateUi('uiMessages.mfda276b4105d') },
      get famousFilms() { return [translateUi('uiMessages.mcdb35e1b830c'), translateUi('uiMessages.m91666019e8de'), translateUi('uiMessages.m5ae1ddd255ca'), translateUi('uiMessages.m4af596e0fbf8'), '1917', translateUi('uiMessages.mda6591da7de6')] },
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'sigma-cine-ff', 'zeiss-cp3']
    },
    {
      id: 'arri-alexa-lf',
      name: 'ARRI Alexa LF',
      get nameCn() { return translateUi('uiMessages.m97558fda544b') },
      type: 'DIGITAL',
      year: 2018,
      format: 'Large Format (4.5K)',
      get sensor() { return translateUi('uiMessages.m8ba3f1828273') },
      get description() { return translateUi('uiMessages.md1c6bd365736') },
      get famousFilms() { return [translateUi('uiMessages.m77bc763b78ae'), translateUi('uiMessages.mf9ebeb89b2b2'), translateUi('uiMessages.m56ce58cf0cb3'), translateUi('uiMessages.m810212b92720'), translateUi('uiMessages.m402733b839d0')] },
      compatibleMounts: ['LPL', 'PL'],
      compatibleLenses: ['arri-signature-prime', 'zeiss-supreme-prime', 'cooke-s7', 'leica-thalia']
    },
    {
      id: 'arri-alexa-mini-lf',
      name: 'ARRI Alexa Mini LF',
      get nameCn() { return translateUi('uiMessages.mb4d316fef717') },
      type: 'DIGITAL',
      year: 2019,
      format: 'Large Format (4.5K)',
      get sensor() { return translateUi('uiMessages.m8ba3f1828273') },
      get description() { return translateUi('uiMessages.m61524bb191fe') },
      get famousFilms() { return [translateUi('uiMessages.md9bccdc7c4d7'), translateUi('uiMessages.m49294a3bf48c'), translateUi('uiMessages.m5c3b3451481b'), translateUi('uiMessages.m3d0f1dc8673c'), translateUi('uiMessages.m5cb5362d793d'), translateUi('uiMessages.mbfb4ee75888a')] },
      compatibleMounts: ['LPL', 'PL'],
      compatibleLenses: ['arri-signature-prime', 'zeiss-supreme-prime', 'cooke-s7', 'leica-thalia', 'sigma-cine-ff']
    },
    {
      id: 'arri-alexa-35',
      name: 'ARRI Alexa 35',
      get nameCn() { return translateUi('uiMessages.m60db138539b6') },
      type: 'DIGITAL',
      year: 2022,
      format: 'Super 35 (4.6K)',
      get sensor() { return translateUi('uiMessages.m5b1bb60baeb3') },
      get description() { return translateUi('uiMessages.mf62aeed0beea') },
      get famousFilms() { return [translateUi('uiMessages.m75f4858ec5c9'), translateUi('uiMessages.m900b682b03b9'), translateUi('uiMessages.m254b7b3e0c60'), translateUi('uiMessages.m8069629a6bd0')] },
      compatibleMounts: ['PL', 'LPL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'cooke-s5', 'arri-signature-prime', 'zeiss-supreme-prime', 'sigma-cine-ff', 'canon-k35']
    },
    {
      id: 'arri-alexa-65',
      name: 'ARRI Alexa 65',
      get nameCn() { return translateUi('uiMessages.m0b054ca154e0') },
      type: 'DIGITAL',
      year: 2014,
      format: '65mm (6.5K)',
      get sensor() { return translateUi('uiMessages.macfbdec681f6') },
      get description() { return translateUi('uiMessages.md7b4d71eed17') },
      get famousFilms() { return [translateUi('uiMessages.ma22bdc4c5a4f'), translateUi('uiMessages.m7b63eb98ab70'), translateUi('uiMessages.m6cf4c02955a9'), translateUi('uiMessages.md9bccdc7c4d7'), translateUi('uiMessages.m31bc2bcec602'), translateUi('uiMessages.m90e18bd9310d')] },
      compatibleMounts: ['XPL'],
      compatibleLenses: ['arri-prime-65', 'arri-prime-dna', 'hasselblad-hc']
    },
    {
      id: 'arri-amira',
      name: 'ARRI AMIRA',
      get nameCn() { return translateUi('uiMessages.m3ee4ffd0f3bc') },
      type: 'DIGITAL',
      year: 2014,
      format: 'Super 35 (3.2K)',
      get sensor() { return translateUi('uiMessages.m53b1f5bcaa88') },
      get description() { return translateUi('uiMessages.md6967a0e8a45') },
      get famousFilms() { return [translateUi('uiMessages.m6bdcbec9057e'), translateUi('uiMessages.m0e21f722b5b4'), translateUi('uiMessages.mfced7b64cf69')] },
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['zeiss-ultra-prime', 'cooke-s4', 'sigma-cine-ff', 'zeiss-cp3']
    },
    
    // ----- RED 数字机系列 -----
    {
      id: 'red-one-mx',
      name: 'RED ONE MX',
      get nameCn() { return translateUi('uiMessages.m45b9d93be0ab') },
      type: 'DIGITAL',
      year: 2009,
      format: 'Super 35 (4.5K)',
      get sensor() { return translateUi('uiMessages.maf45e29a4255') },
      get description() { return translateUi('uiMessages.m973aec6b42d2') },
      get famousFilms() { return [translateUi('uiMessages.m7c2f6df7f638'), translateUi('uiMessages.mc84dc63e6a17'), translateUi('uiMessages.m264d371427d9'), translateUi('uiMessages.m3f9465942e0b')] },
      compatibleMounts: ['PL', 'RED'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'panavision-primo']
    },
    {
      id: 'red-scarlet-x',
      name: 'RED Scarlet-X',
      get nameCn() { return translateUi('uiMessages.m65a4c37d8624') },
      type: 'DIGITAL',
      year: 2011,
      format: 'Super 35 (4K)',
      get sensor() { return translateUi('uiMessages.mc26f9e47096a') },
      get description() { return translateUi('uiMessages.mea163814aec6') },
      get famousFilms() { return [translateUi('uiMessages.mbf1f68960a5e'), translateUi('uiMessages.m58f17d966154')] },
      compatibleMounts: ['PL', 'Canon EF'],
      compatibleLenses: ['zeiss-cp2', 'sigma-cine-ff', 'canon-cn-e']
    },
    {
      id: 'red-epic-m',
      name: 'RED Epic-M',
      get nameCn() { return translateUi('uiMessages.m67164b708958') },
      type: 'DIGITAL',
      year: 2011,
      format: 'Super 35 (5K)',
      get sensor() { return translateUi('uiMessages.m142c4f8c336a') },
      get description() { return translateUi('uiMessages.mc106649efca7') },
      get famousFilms() { return [translateUi('uiMessages.ma5b8f3903097'), translateUi('uiMessages.m63166b25bffd'), translateUi('uiMessages.m78e5ad756b99'), translateUi('uiMessages.m42eba1440092')] },
      compatibleMounts: ['PL', 'Canon EF'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'cooke-s5']
    },
    {
      id: 'red-epic-dragon',
      name: 'RED Epic Dragon',
      get nameCn() { return translateUi('uiMessages.m2ddf6fb79415') },
      type: 'DIGITAL',
      year: 2013,
      format: 'Super 35 (6K)',
      get sensor() { return translateUi('uiMessages.m0e9df1eed816') },
      get description() { return translateUi('uiMessages.ma62e59e7dfbb') },
      get famousFilms() { return [translateUi('uiMessages.m759013dc32ea'), translateUi('uiMessages.mb53571b93b41'), translateUi('uiMessages.m0dc399816f52'), translateUi('uiMessages.mb1c80679518f'), translateUi('uiMessages.mf817bb4443f1')] },
      compatibleMounts: ['PL', 'Canon EF'],
      compatibleLenses: ['zeiss-master-prime', 'cooke-s4', 'cooke-s5', 'sigma-cine-ff']
    },
    {
      id: 'red-weapon-helium',
      name: 'RED Weapon Helium 8K',
      get nameCn() { return translateUi('uiMessages.m36e1893230fc') },
      type: 'DIGITAL',
      year: 2016,
      format: 'Super 35 (8K)',
      get sensor() { return translateUi('uiMessages.meda010c96058') },
      get description() { return translateUi('uiMessages.m6dbb872cf436') },
      get famousFilms() { return [translateUi('uiMessages.mab4f217f45d4'), translateUi('uiMessages.m354876703d8d'), translateUi('uiMessages.m5b35d533e7d6'), translateUi('uiMessages.m31f77dc71dfd'), translateUi('uiMessages.m106c9756467b')] },
      compatibleMounts: ['PL', 'Canon EF'],
      compatibleLenses: ['zeiss-master-prime', 'cooke-s5', 'leica-summilux-c', 'sigma-cine-ff']
    },
    {
      id: 'red-monstro-8k',
      name: 'RED Monstro 8K VV',
      get nameCn() { return translateUi('uiMessages.m702301c82aa1') },
      type: 'DIGITAL',
      year: 2017,
      format: 'VV/Full Frame (8K)',
      get sensor() { return translateUi('uiMessages.m2925f8cfbdfe') },
      get description() { return translateUi('uiMessages.m43ae2e608bdb') },
      get famousFilms() { return [translateUi('uiMessages.m900b682b03b9'), translateUi('uiMessages.m254b7b3e0c60'), translateUi('uiMessages.m01dc5778ff55')] },
      compatibleMounts: ['PL', 'Canon EF'],
      compatibleLenses: ['zeiss-supreme-prime', 'cooke-s7', 'leica-summilux-c', 'sigma-cine-ff']
    },
    {
      id: 'red-gemini',
      name: 'RED DSMC2 Gemini 5K',
      get nameCn() { return translateUi('uiMessages.m044a6317903f') },
      type: 'DIGITAL',
      year: 2018,
      format: 'Super 35 (5K)',
      get sensor() { return translateUi('uiMessages.m96db1f011f4e') },
      get description() { return translateUi('uiMessages.m20392acd8bae') },
      get famousFilms() { return [translateUi('uiMessages.m84463ed9796b'), translateUi('uiMessages.m01dc5778ff55'), translateUi('uiMessages.mb328e0fa2315')] },
      compatibleMounts: ['PL', 'Canon EF'],
      compatibleLenses: ['zeiss-master-prime', 'cooke-s4', 'sigma-cine-ff', 'zeiss-cp3']
    },
    {
      id: 'red-komodo',
      name: 'RED Komodo',
      get nameCn() { return translateUi('uiMessages.m566a0e6b454d') },
      type: 'DIGITAL',
      year: 2020,
      format: 'Super 35 (6K)',
      get sensor() { return translateUi('uiMessages.mc32744b13cc7') },
      get description() { return translateUi('uiMessages.mf8eec96d9845') },
      get famousFilms() { return [translateUi('uiMessages.m056df686f54c'), translateUi('uiMessages.mbf1f68960a5e'), translateUi('uiMessages.m5cfd1fde525f')] },
      compatibleMounts: ['RF'],
      compatibleLenses: ['sigma-cine-ff', 'canon-sumire', 'zeiss-cp3']
    },
    {
      id: 'red-komodo-x',
      name: 'RED Komodo-X',
      get nameCn() { return translateUi('uiMessages.m83d28b8db6bd') },
      type: 'DIGITAL',
      year: 2023,
      format: 'Super 35 (6K)',
      get sensor() { return translateUi('uiMessages.mb1d318fb0c60') },
      get description() { return translateUi('uiMessages.m1f7572645461') },
      get famousFilms() { return [translateUi('uiMessages.mbda14ebf5ed0'), translateUi('uiMessages.mbe9bf6e10612')] },
      compatibleMounts: ['RF'],
      compatibleLenses: ['sigma-cine-ff', 'canon-sumire', 'zeiss-cp3', 'dzofilm-vespid']
    },
    {
      id: 'red-v-raptor',
      name: 'RED V-Raptor',
      get nameCn() { return translateUi('uiMessages.m86f2613f1bff') },
      type: 'DIGITAL',
      year: 2021,
      format: 'VV (8K)',
      get sensor() { return translateUi('uiMessages.m1ae5679fb00e') },
      get description() { return translateUi('uiMessages.m7d6dbf7b5f3e') },
      get famousFilms() { return [translateUi('uiMessages.m4c09035ffb3a'), translateUi('uiMessages.mf782df4c76fe'), translateUi('uiMessages.m36c48796d8ff')] },
      compatibleMounts: ['PL', 'RF'],
      compatibleLenses: ['zeiss-supreme-prime', 'cooke-s7', 'sigma-cine-ff', 'canon-sumire', 'leica-summilux-c']
    },
    {
      id: 'red-v-raptor-xl',
      name: 'RED V-Raptor XL',
      get nameCn() { return translateUi('uiMessages.m2d99bfb65f85') },
      type: 'DIGITAL',
      year: 2022,
      format: 'VV (8K)',
      get sensor() { return translateUi('uiMessages.m1ae5679fb00e') },
      get description() { return translateUi('uiMessages.m9032a81bfee7') },
      get famousFilms() { return [translateUi('uiMessages.mb328e0fa2315'), translateUi('uiMessages.m36c48796d8ff')] },
      compatibleMounts: ['PL', 'RF'],
      compatibleLenses: ['zeiss-supreme-prime', 'cooke-s7', 'leica-summilux-c', 'arri-signature-prime']
    },
    {
      id: 'red-ranger-monstro',
      name: 'RED Ranger Monstro',
      get nameCn() { return translateUi('uiMessages.m2517ab6f6cc1') },
      type: 'DIGITAL',
      year: 2019,
      format: 'VV (8K)',
      get sensor() { return translateUi('uiMessages.m2925f8cfbdfe') },
      get description() { return translateUi('uiMessages.m61ef16bb0338') },
      get famousFilms() { return [translateUi('uiMessages.m4745528c7c97')] },
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-supreme-prime', 'cooke-s7', 'leica-summilux-c', 'arri-signature-prime']
    },
    
    // ----- Sony 数字机系列 -----
    {
      id: 'sony-f35',
      name: 'Sony F35',
      get nameCn() { return translateUi('uiMessages.m23be799ceda1') },
      type: 'DIGITAL',
      year: 2009,
      format: 'Super 35 (1080p)',
      get sensor() { return translateUi('uiMessages.mc1c0c0d26ebb') },
      get description() { return translateUi('uiMessages.m32ea4d8b7c92') },
      get famousFilms() { return [translateUi('uiMessages.m94341ed399cb'), translateUi('uiMessages.m19d3342b6711'), translateUi('uiMessages.mddf6df5d4b11')] },
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'panavision-primo']
    },
    {
      id: 'sony-f55',
      name: 'Sony F55',
      get nameCn() { return translateUi('uiMessages.m1f7b6f8a73aa') },
      type: 'DIGITAL',
      year: 2013,
      format: 'Super 35 (4K)',
      get sensor() { return translateUi('uiMessages.m29c86b265036') },
      get description() { return translateUi('uiMessages.m5ad19be12451') },
      get famousFilms() { return [translateUi('uiMessages.m08bf0c31e4ce'), translateUi('uiMessages.mf5b047b66a6a'), translateUi('uiMessages.mb328e0fa2315')] },
      compatibleMounts: ['PL', 'FZ'],
      compatibleLenses: ['zeiss-master-prime', 'cooke-s4', 'sony-cinealta', 'sigma-cine-ff']
    },
    {
      id: 'sony-f65',
      name: 'Sony F65',
      get nameCn() { return translateUi('uiMessages.mbf52cac809de') },
      type: 'DIGITAL',
      year: 2012,
      format: 'Super 35 (8K)',
      get sensor() { return translateUi('uiMessages.mbaac3aa1068d') },
      get description() { return translateUi('uiMessages.mba4419155de1') },
      get famousFilms() { return [translateUi('uiMessages.mc930ecafd087'), translateUi('uiMessages.m42eba1440092'), translateUi('uiMessages.m7bd635c6048a'), translateUi('uiMessages.md92a768bba4c')] },
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'cooke-s5', 'leica-summilux-c', 'sony-cinealta']
    },
    {
      id: 'sony-fs7',
      name: 'Sony PXW-FS7',
      get nameCn() { return translateUi('uiMessages.m2886c83c37a0') },
      type: 'DIGITAL',
      year: 2014,
      format: 'Super 35 (4K)',
      get sensor() { return translateUi('uiMessages.m6b2ae8eae810') },
      get description() { return translateUi('uiMessages.m6d2b2642b938') },
      get famousFilms() { return [translateUi('uiMessages.m8a4ddf89a658'), translateUi('uiMessages.m2a4d406ae8f1'), translateUi('uiMessages.mde954f5dec77')] },
      compatibleMounts: ['E'],
      compatibleLenses: ['sony-cinealta', 'sigma-cine-ff', 'zeiss-cp3']
    },
    {
      id: 'sony-fs7-ii',
      name: 'Sony PXW-FS7 II',
      get nameCn() { return translateUi('uiMessages.m4a7ca0137172') },
      type: 'DIGITAL',
      year: 2016,
      format: 'Super 35 (4K)',
      get sensor() { return translateUi('uiMessages.m6b2ae8eae810') },
      get description() { return translateUi('uiMessages.mefa531a0d41b') },
      get famousFilms() { return [translateUi('uiMessages.m7bd979e83ae5'), translateUi('uiMessages.m1ed2f25950f8'), translateUi('uiMessages.m692ddc85ea93')] },
      compatibleMounts: ['E'],
      compatibleLenses: ['sony-cinealta', 'sigma-cine-ff', 'zeiss-cp3', 'dzofilm-vespid']
    },
    {
      id: 'sony-fx6',
      name: 'Sony FX6',
      get nameCn() { return translateUi('uiMessages.m72a8c7bebce7') },
      type: 'DIGITAL',
      year: 2020,
      format: 'Full Frame (4K)',
      get sensor() { return translateUi('uiMessages.ma63899cf08bb') },
      get description() { return translateUi('uiMessages.m726b663e0ed9') },
      get famousFilms() { return [translateUi('uiMessages.m302390a51d39'), translateUi('uiMessages.m1688e428859d'), translateUi('uiMessages.mc4ffeab703f4')] },
      compatibleMounts: ['E'],
      compatibleLenses: ['sony-cinealta', 'sigma-cine-ff', 'zeiss-cp3']
    },
    {
      id: 'sony-fx9',
      name: 'Sony PXW-FX9',
      get nameCn() { return translateUi('uiMessages.m8395f79333ba') },
      type: 'DIGITAL',
      year: 2019,
      format: 'Full Frame (6K)',
      get sensor() { return translateUi('uiMessages.m899a75f1b063') },
      get description() { return translateUi('uiMessages.m082447cec1a6') },
      get famousFilms() { return [translateUi('uiMessages.m6aaffc548ce4'), translateUi('uiMessages.mb328e0fa2315'), translateUi('uiMessages.mec4124cf053e')] },
      compatibleMounts: ['E'],
      compatibleLenses: ['sony-cinealta', 'zeiss-supreme-prime', 'sigma-cine-ff', 'cooke-s7']
    },
    {
      id: 'sony-venice',
      name: 'Sony Venice',
      get nameCn() { return translateUi('uiMessages.me40f485860f6') },
      type: 'DIGITAL',
      year: 2017,
      format: 'Full Frame (6K)',
      get sensor() { return translateUi('uiMessages.m198596a60651') },
      get description() { return translateUi('uiMessages.md41506735784') },
      get famousFilms() { return [translateUi('uiMessages.m5ae1ddd255ca'), translateUi('uiMessages.me497bd274c72'), translateUi('uiMessages.m783fd58504df'), translateUi('uiMessages.ma5f0330daeca'), translateUi('uiMessages.mf94a26b2c6ff')] },
      compatibleMounts: ['PL', 'E'],
      compatibleLenses: ['zeiss-supreme-prime', 'cooke-s7', 'leica-summilux-c', 'sony-cinealta', 'sigma-cine-ff']
    },
    {
      id: 'sony-venice-2',
      name: 'Sony Venice 2',
      get nameCn() { return translateUi('uiMessages.m96510e045ff0') },
      type: 'DIGITAL',
      year: 2022,
      format: 'Full Frame (8.6K)',
      get sensor() { return translateUi('uiMessages.m3b49bd679eae') },
      get description() { return translateUi('uiMessages.m639550e486a6') },
      get famousFilms() { return [translateUi('uiMessages.m254b7b3e0c60'), translateUi('uiMessages.m73eea7e9226c'), translateUi('uiMessages.m7b0dc673f3c4'), translateUi('uiMessages.m80455246eaef')] },
      compatibleMounts: ['PL', 'E'],
      compatibleLenses: ['zeiss-supreme-prime', 'cooke-s7', 'leica-summilux-c', 'sony-cinealta', 'sigma-cine-ff']
    },
    {
      id: 'sony-burano',
      name: 'Sony Burano',
      get nameCn() { return translateUi('uiMessages.mfe723822c4fb') },
      type: 'DIGITAL',
      year: 2023,
      format: 'Full Frame (8.6K)',
      get sensor() { return translateUi('uiMessages.m3b49bd679eae') },
      get description() { return translateUi('uiMessages.m4b55a5a894e6') },
      get famousFilms() { return [translateUi('uiMessages.m735cf5b7ee17'), translateUi('uiMessages.mec4124cf053e')] },
      compatibleMounts: ['PL', 'E'],
      compatibleLenses: ['sony-cinealta', 'zeiss-supreme-prime', 'sigma-cine-ff', 'cooke-s7']
    },
    
    // ----- Canon 数字机系列 -----
    {
      id: 'canon-c100',
      name: 'Canon EOS C100',
      get nameCn() { return translateUi('uiMessages.m51d5eaedca08') },
      type: 'DIGITAL',
      year: 2012,
      format: 'Super 35 (1080p)',
      get sensor() { return translateUi('uiMessages.m0cbe77e009d6') },
      get description() { return translateUi('uiMessages.mb5fbe56a8973') },
      get famousFilms() { return [translateUi('uiMessages.mf5f66342cf58'), translateUi('uiMessages.m0be92352d07b')] },
      compatibleMounts: ['EF'],
      compatibleLenses: ['canon-cn-e', 'sigma-cine-ff', 'zeiss-cp2']
    },
    {
      id: 'canon-c100-ii',
      name: 'Canon EOS C100 Mark II',
      get nameCn() { return translateUi('uiMessages.mdbfb664f1b8f') },
      type: 'DIGITAL',
      year: 2014,
      format: 'Super 35 (1080p)',
      get sensor() { return translateUi('uiMessages.m0cbe77e009d6') },
      get description() { return translateUi('uiMessages.m59979ed61379') },
      get famousFilms() { return [translateUi('uiMessages.m1688e428859d'), translateUi('uiMessages.m1ed2f25950f8')] },
      compatibleMounts: ['EF'],
      compatibleLenses: ['canon-cn-e', 'sigma-cine-ff', 'zeiss-cp2']
    },
    {
      id: 'canon-c200',
      name: 'Canon EOS C200',
      get nameCn() { return translateUi('uiMessages.mb4a1a35c7c97') },
      type: 'DIGITAL',
      year: 2017,
      format: 'Super 35 (4K)',
      get sensor() { return translateUi('uiMessages.mfdc566906391') },
      get description() { return translateUi('uiMessages.m1c8ce14fc0b0') },
      get famousFilms() { return [translateUi('uiMessages.mbf1f68960a5e'), translateUi('uiMessages.m7f06c4a006f4')] },
      compatibleMounts: ['EF'],
      compatibleLenses: ['canon-cn-e', 'canon-sumire', 'sigma-cine-ff', 'zeiss-cp3']
    },
    {
      id: 'canon-c300',
      name: 'Canon EOS C300',
      get nameCn() { return translateUi('uiMessages.ma86120fd6b1b') },
      type: 'DIGITAL',
      year: 2012,
      format: 'Super 35 (4K)',
      get sensor() { return translateUi('uiMessages.m0c03172dff5b') },
      get description() { return translateUi('uiMessages.mddaae771f962') },
      get famousFilms() { return [translateUi('uiMessages.m11932b2b2bd6'), translateUi('uiMessages.mb6230a1dc3fc'), translateUi('uiMessages.mde954f5dec77')] },
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['canon-cn-e', 'zeiss-cp2', 'cooke-s4']
    },
    {
      id: 'canon-c300-ii',
      name: 'Canon EOS C300 Mark II',
      get nameCn() { return translateUi('uiMessages.me9c34165e9fc') },
      type: 'DIGITAL',
      year: 2015,
      format: 'Super 35 (4K)',
      get sensor() { return translateUi('uiMessages.m9e9e14a16a95') },
      get description() { return translateUi('uiMessages.mb0aa9c7ee497') },
      get famousFilms() { return [translateUi('uiMessages.m3ac2417a5f4a'), translateUi('uiMessages.mb328e0fa2315'), translateUi('uiMessages.mec4124cf053e')] },
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['canon-cn-e', 'canon-sumire', 'zeiss-cp3', 'sigma-cine-ff']
    },
    {
      id: 'canon-c300-iii',
      name: 'Canon EOS C300 Mark III',
      get nameCn() { return translateUi('uiMessages.me0ae20a51688') },
      type: 'DIGITAL',
      year: 2020,
      format: 'Super 35 (4K DGO)',
      get sensor() { return translateUi('uiMessages.m15facccbd07c') },
      get description() { return translateUi('uiMessages.m3944d1ab6b8a') },
      get famousFilms() { return [translateUi('uiMessages.m84463ed9796b'), translateUi('uiMessages.md82e576a04ca')] },
      compatibleMounts: ['PL', 'EF', 'RF'],
      compatibleLenses: ['canon-sumire', 'zeiss-cp3', 'sigma-cine-ff', 'dzofilm-vespid']
    },
    {
      id: 'canon-c500',
      name: 'Canon EOS C500',
      get nameCn() { return translateUi('uiMessages.m1cc2b26d5189') },
      type: 'DIGITAL',
      year: 2012,
      format: 'Super 35 (4K)',
      get sensor() { return translateUi('uiMessages.m35a17522a812') },
      get description() { return translateUi('uiMessages.m399fc3b04103') },
      get famousFilms() { return [translateUi('uiMessages.meffcc18cc792'), translateUi('uiMessages.mcd31db22a9ca')] },
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['canon-cn-e', 'zeiss-master-prime', 'cooke-s4']
    },
    {
      id: 'canon-c500-ii',
      name: 'Canon EOS C500 Mark II',
      get nameCn() { return translateUi('uiMessages.m3df3dec66b66') },
      type: 'DIGITAL',
      year: 2019,
      format: 'Full Frame (5.9K)',
      get sensor() { return translateUi('uiMessages.mf0e8f4303a44') },
      get description() { return translateUi('uiMessages.m34c4aaa0adaa') },
      get famousFilms() { return [translateUi('uiMessages.m36c48796d8ff'), translateUi('uiMessages.mb17ce9fcf29c')] },
      compatibleMounts: ['PL', 'EF', 'RF'],
      compatibleLenses: ['canon-sumire', 'canon-k35', 'zeiss-cp3', 'sigma-cine-ff']
    },
    {
      id: 'canon-c700',
      name: 'Canon EOS C700',
      get nameCn() { return translateUi('uiMessages.m7e28df54f2d0') },
      type: 'DIGITAL',
      year: 2016,
      format: 'Super 35 (4.5K)',
      get sensor() { return translateUi('uiMessages.m255fde5190dd') },
      get description() { return translateUi('uiMessages.m43bd28fd0628') },
      get famousFilms() { return [translateUi('uiMessages.mb844b9b7d0a6'), translateUi('uiMessages.md82e576a04ca')] },
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['canon-cn-e', 'canon-sumire', 'zeiss-master-prime', 'cooke-s5']
    },
    {
      id: 'canon-c700-ff',
      name: 'Canon EOS C700 FF',
      get nameCn() { return translateUi('uiMessages.m60746dacb668') },
      type: 'DIGITAL',
      year: 2018,
      format: 'Full Frame (5.9K)',
      get sensor() { return translateUi('uiMessages.mf0e8f4303a44') },
      get description() { return translateUi('uiMessages.m08015b7e86b6') },
      get famousFilms() { return [translateUi('uiMessages.m36c48796d8ff'), translateUi('uiMessages.mb17ce9fcf29c')] },
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['canon-sumire', 'zeiss-supreme-prime', 'cooke-s7', 'leica-thalia']
    },
    {
      id: 'canon-c70',
      name: 'Canon EOS C70',
      get nameCn() { return translateUi('uiMessages.m52ebf25c958c') },
      type: 'DIGITAL',
      year: 2020,
      format: 'Super 35 (4K DGO)',
      get sensor() { return translateUi('uiMessages.m15facccbd07c') },
      get description() { return translateUi('uiMessages.mfe587b034389') },
      get famousFilms() { return [translateUi('uiMessages.mbf1f68960a5e'), translateUi('uiMessages.m1688e428859d'), translateUi('uiMessages.mc4ffeab703f4')] },
      compatibleMounts: ['RF'],
      compatibleLenses: ['canon-sumire', 'sigma-cine-ff', 'zeiss-cp3']
    },
    
    // ----- Blackmagic 数字机系列 -----
    {
      id: 'bmd-cinema-camera',
      name: 'Blackmagic Cinema Camera',
      get nameCn() { return translateUi('uiMessages.m1b9b5d09599b') },
      type: 'DIGITAL',
      year: 2012,
      format: 'Super 16 (2.5K)',
      get sensor() { return translateUi('uiMessages.md64bd1f233c5') },
      get description() { return translateUi('uiMessages.ma13566ebe8b9') },
      get famousFilms() { return [translateUi('uiMessages.mbf1f68960a5e'), translateUi('uiMessages.m203f78d268b4')] },
      compatibleMounts: ['EF'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp2', 'samyang-xeen']
    },
    {
      id: 'bmd-production-4k',
      name: 'Blackmagic Production Camera 4K',
      get nameCn() { return translateUi('uiMessages.mc40de5e9f1f0') },
      type: 'DIGITAL',
      year: 2014,
      format: 'Super 35 (4K)',
      get sensor() { return translateUi('uiMessages.m089c72b63385') },
      get description() { return translateUi('uiMessages.m99c30027c6ac') },
      get famousFilms() { return [translateUi('uiMessages.mbf1f68960a5e'), translateUi('uiMessages.m7f06c4a006f4')] },
      compatibleMounts: ['EF'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp2', 'samyang-xeen']
    },
    {
      id: 'bmd-ursa',
      name: 'Blackmagic URSA',
      get nameCn() { return translateUi('uiMessages.m25732a85d41d') },
      type: 'DIGITAL',
      year: 2014,
      format: 'Super 35 (4K)',
      get sensor() { return translateUi('uiMessages.mdd428ba77ca4') },
      get description() { return translateUi('uiMessages.mbd98f8e1c3e3') },
      get famousFilms() { return [translateUi('uiMessages.m6283d58d2c1e'), translateUi('uiMessages.m7f06c4a006f4')] },
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp3', 'dzofilm-vespid']
    },
    {
      id: 'bmd-ursa-mini-4k',
      name: 'Blackmagic URSA Mini 4K',
      get nameCn() { return translateUi('uiMessages.m58d719606a9a') },
      type: 'DIGITAL',
      year: 2015,
      format: 'Super 35 (4K)',
      get sensor() { return translateUi('uiMessages.mdd428ba77ca4') },
      get description() { return translateUi('uiMessages.m52d727225e97') },
      get famousFilms() { return [translateUi('uiMessages.mbf1f68960a5e'), translateUi('uiMessages.m1688e428859d')] },
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp3', 'dzofilm-vespid']
    },
    {
      id: 'bmd-ursa-mini-pro',
      name: 'Blackmagic URSA Mini Pro',
      get nameCn() { return translateUi('uiMessages.m908b21d93910') },
      type: 'DIGITAL',
      year: 2017,
      format: 'Super 35 (4.6K)',
      get sensor() { return translateUi('uiMessages.mb3b344a49ea6') },
      get description() { return translateUi('uiMessages.mfe4287b4646f') },
      get famousFilms() { return [translateUi('uiMessages.m6283d58d2c1e'), translateUi('uiMessages.m1688e428859d'), translateUi('uiMessages.m5f9f1409615a')] },
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp3', 'cooke-s4', 'dzofilm-vespid']
    },
    {
      id: 'bmd-ursa-mini-pro-g2',
      name: 'Blackmagic URSA Mini Pro G2',
      get nameCn() { return translateUi('uiMessages.mbd9339c9abc6') },
      type: 'DIGITAL',
      year: 2019,
      format: 'Super 35 (4.6K)',
      get sensor() { return translateUi('uiMessages.ma7f659dd3260') },
      get description() { return translateUi('uiMessages.m473501419c0f') },
      get famousFilms() { return [translateUi('uiMessages.mbf1f68960a5e'), translateUi('uiMessages.m670ef8ec0ecd')] },
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp3', 'cooke-s4', 'dzofilm-vespid']
    },
    {
      id: 'blackmagic-ursa-12k',
      name: 'Blackmagic URSA Mini Pro 12K',
      get nameCn() { return translateUi('uiMessages.m207d52b51341') },
      type: 'DIGITAL',
      year: 2020,
      format: 'Super 35 (12K)',
      get sensor() { return translateUi('uiMessages.mac19c21b9215') },
      get description() { return translateUi('uiMessages.m07cbd441a79f') },
      get famousFilms() { return [translateUi('uiMessages.mbe9bf6e10612'), translateUi('uiMessages.m36c48796d8ff')] },
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['zeiss-cp3', 'sigma-cine-ff', 'dzofilm-vespid']
    },
    {
      id: 'bmd-pocket-4k',
      name: 'Blackmagic Pocket Cinema Camera 4K',
      get nameCn() { return translateUi('uiMessages.m43f45d8586be') },
      type: 'DIGITAL',
      year: 2018,
      format: 'Micro 4/3 (4K)',
      get sensor() { return translateUi('uiMessages.m634e55c70a60') },
      get description() { return translateUi('uiMessages.m1810c690126f') },
      get famousFilms() { return [translateUi('uiMessages.mc4ffeab703f4'), translateUi('uiMessages.me4fced88fc6a'), translateUi('uiMessages.m03abf6e3757a')] },
      compatibleMounts: ['MFT'],
      compatibleLenses: ['sigma-cine-ff', 'dzofilm-vespid', 'meike-cine']
    },
    {
      id: 'bmd-pocket-6k',
      name: 'Blackmagic Pocket Cinema Camera 6K',
      get nameCn() { return translateUi('uiMessages.m785cd3dda525') },
      type: 'DIGITAL',
      year: 2019,
      format: 'Super 35 (6K)',
      get sensor() { return translateUi('uiMessages.m29caf63e403b') },
      get description() { return translateUi('uiMessages.m6e3c4ae1fd22') },
      get famousFilms() { return [translateUi('uiMessages.mbf1f68960a5e'), translateUi('uiMessages.m0be92352d07b'), translateUi('uiMessages.mc4ffeab703f4')] },
      compatibleMounts: ['EF'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp3', 'dzofilm-vespid']
    },
    {
      id: 'bmd-pocket-6k-pro',
      name: 'Blackmagic Pocket Cinema Camera 6K Pro',
      get nameCn() { return translateUi('uiMessages.m6d4f3a3f2069') },
      type: 'DIGITAL',
      year: 2021,
      format: 'Super 35 (6K)',
      get sensor() { return translateUi('uiMessages.m29caf63e403b') },
      get description() { return translateUi('uiMessages.m58679472eb78') },
      get famousFilms() { return [translateUi('uiMessages.mec91f12857c2'), translateUi('uiMessages.m1688e428859d')] },
      compatibleMounts: ['EF'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp3', 'dzofilm-vespid']
    },
    {
      id: 'bmd-pocket-6k-g2',
      name: 'Blackmagic Pocket Cinema Camera 6K G2',
      get nameCn() { return translateUi('uiMessages.m74eb70c21a5b') },
      type: 'DIGITAL',
      year: 2022,
      format: 'Super 35 (6K)',
      get sensor() { return translateUi('uiMessages.m29caf63e403b') },
      get description() { return translateUi('uiMessages.m0833f27e003e') },
      get famousFilms() { return [translateUi('uiMessages.mbf1f68960a5e'), translateUi('uiMessages.m2169c68eef0d')] },
      compatibleMounts: ['EF'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp3', 'dzofilm-vespid']
    },
    
    // ----- Panasonic 数字机系列 -----
    {
      id: 'panasonic-varicam',
      name: 'Panasonic VariCam',
      get nameCn() { return translateUi('uiMessages.md7e3edf44678') },
      type: 'DIGITAL',
      year: 2002,
      format: 'Super 35 (1080p)',
      get sensor() { return translateUi('uiMessages.m691e5423fde4') },
      get description() { return translateUi('uiMessages.ma1be373b9768') },
      get famousFilms() { return [translateUi('uiMessages.m6d3da7cd5cb1'), translateUi('uiMessages.m1688e428859d')] },
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'cooke-s4', 'panavision-primo']
    },
    {
      id: 'panasonic-varicam-35',
      name: 'Panasonic VariCam 35',
      get nameCn() { return translateUi('uiMessages.m3c0aaf845f32') },
      type: 'DIGITAL',
      year: 2014,
      format: 'Super 35 (4K)',
      get sensor() { return translateUi('uiMessages.mc1657cda4413') },
      get description() { return translateUi('uiMessages.mdf7de9f6b33e') },
      get famousFilms() { return [translateUi('uiMessages.maf8c180cd400'), translateUi('uiMessages.mb3f1048b2d41'), translateUi('uiMessages.m12fe41173851')] },
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['zeiss-master-prime', 'cooke-s4', 'cooke-s5', 'sigma-cine-ff']
    },
    {
      id: 'panasonic-varicam-lt',
      name: 'Panasonic VariCam LT',
      get nameCn() { return translateUi('uiMessages.m059b14a0f530') },
      type: 'DIGITAL',
      year: 2016,
      format: 'Super 35 (4K)',
      get sensor() { return translateUi('uiMessages.mc1657cda4413') },
      get description() { return translateUi('uiMessages.m6f8e310d2939') },
      get famousFilms() { return [translateUi('uiMessages.m1688e428859d'), translateUi('uiMessages.m1ed2f25950f8')] },
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['zeiss-cp3', 'sigma-cine-ff', 'cooke-s4']
    },
    {
      id: 'panasonic-varicam-pure',
      name: 'Panasonic VariCam Pure',
      get nameCn() { return translateUi('uiMessages.mbf2417c23e80') },
      type: 'DIGITAL',
      year: 2016,
      format: 'Super 35 (4K)',
      get sensor() { return translateUi('uiMessages.mc1657cda4413') },
      get description() { return translateUi('uiMessages.m6c9cc281c7d0') },
      get famousFilms() { return [translateUi('uiMessages.m94f8f0cfb65f')] },
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'cooke-s4', 'cooke-s5']
    },
    {
      id: 'panasonic-eva1',
      name: 'Panasonic AU-EVA1',
      get nameCn() { return translateUi('uiMessages.mb2d96e77515f') },
      type: 'DIGITAL',
      year: 2017,
      format: 'Super 35 (5.7K)',
      get sensor() { return translateUi('uiMessages.m3677219293ff') },
      get description() { return translateUi('uiMessages.ma86b48bf09bd') },
      get famousFilms() { return [translateUi('uiMessages.m1688e428859d'), translateUi('uiMessages.m6283d58d2c1e')] },
      compatibleMounts: ['EF'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp3', 'dzofilm-vespid']
    },
    
    // ----- Panavision 数字机系列 -----
    {
      id: 'panavision-genesis',
      name: 'Panavision Genesis',
      get nameCn() { return translateUi('uiMessages.m1e968cede97f') },
      type: 'DIGITAL',
      year: 2004,
      format: 'Super 35 (1080p)',
      get sensor() { return translateUi('uiMessages.me526cdb4642a') },
      get description() { return translateUi('uiMessages.med8b48eced9c') },
      get famousFilms() { return [translateUi('uiMessages.ma6f16b0611ea'), translateUi('uiMessages.m108c4489edee'), translateUi('uiMessages.m82853098ca30'), translateUi('uiMessages.mdb71037a68e2')] },
      compatibleMounts: ['PV'],
      compatibleLenses: ['panavision-primo', 'panavision-primo-70', 'panavision-anamorphic-e']
    },
    {
      id: 'panavision-dxl',
      name: 'Panavision Millennium DXL',
      get nameCn() { return translateUi('uiMessages.m6ee3c8f2f78f') },
      type: 'DIGITAL',
      year: 2016,
      format: 'Large Format (8K)',
      get sensor() { return translateUi('uiMessages.m3e3ec74742a6') },
      get description() { return translateUi('uiMessages.m29d949aaa4d2') },
      get famousFilms() { return [translateUi('uiMessages.mf5b047b66a6a'), translateUi('uiMessages.mefdd8cc3433a'), translateUi('uiMessages.m12fe41173851')] },
      compatibleMounts: ['PV'],
      compatibleLenses: ['panavision-primo-70', 'panavision-anamorphic-g', 'panavision-system-65']
    },
    {
      id: 'panavision-dxl2',
      name: 'Panavision Millennium DXL2',
      get nameCn() { return translateUi('uiMessages.m6f7c291153f4') },
      type: 'DIGITAL',
      year: 2018,
      format: 'Large Format (8K)',
      get sensor() { return translateUi('uiMessages.m2925f8cfbdfe') },
      get description() { return translateUi('uiMessages.m4f141fcfe4d3') },
      get famousFilms() { return [translateUi('uiMessages.m64d938c7b348'), translateUi('uiMessages.m8360e92939a6'), translateUi('uiMessages.ma02aca5842b0'), translateUi('uiMessages.mccbd17435e37')] },
      compatibleMounts: ['PV'],
      compatibleLenses: ['panavision-primo-70', 'panavision-anamorphic-g', 'panavision-system-65', 'panavision-ultra-vista']
    },
    
    // ----- 其他品牌数字机 -----
    {
      id: 'kinefinity-mavo-lf',
      name: 'Kinefinity MAVO LF',
      get nameCn() { return translateUi('uiMessages.md5882d1021db') },
      type: 'DIGITAL',
      year: 2018,
      format: 'Large Format (6K)',
      get sensor() { return translateUi('uiMessages.mc6a8e330cd77') },
      get description() { return translateUi('uiMessages.m2d24694ddd16') },
      get famousFilms() { return [translateUi('uiMessages.m384df5af2ffb'), translateUi('uiMessages.md8179b9a19dc')] },
      compatibleMounts: ['PL', 'EF', 'E'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp3', 'dzofilm-vespid']
    },
    {
      id: 'kinefinity-mavo-edge-8k',
      name: 'Kinefinity MAVO Edge 8K',
      get nameCn() { return translateUi('uiMessages.m86418f4abaf6') },
      type: 'DIGITAL',
      year: 2021,
      format: 'Full Frame (8K)',
      get sensor() { return translateUi('uiMessages.me5338213e683') },
      get description() { return translateUi('uiMessages.mcbc4dd426e82') },
      get famousFilms() { return [translateUi('uiMessages.medf14ed92ba4'), translateUi('uiMessages.m36c48796d8ff')] },
      compatibleMounts: ['PL', 'EF', 'E'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp3', 'dzofilm-vespid', 'zeiss-supreme-prime']
    },
    {
      id: 'z-cam-e2-f8',
      name: 'Z CAM E2-F8',
      get nameCn() { return translateUi('uiMessages.m452fb4b89836') },
      type: 'DIGITAL',
      year: 2020,
      format: 'Full Frame (8K)',
      get sensor() { return translateUi('uiMessages.m80d7c6b8b4d3') },
      get description() { return translateUi('uiMessages.m27d7a58f9e07') },
      get famousFilms() { return [translateUi('uiMessages.m6c4db5cd689a'), translateUi('uiMessages.mb4fadf2ecc98')] },
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp3', 'dzofilm-vespid']
    },
    {
      id: 'phantom-flex4k',
      name: 'Phantom Flex4K',
      get nameCn() { return translateUi('uiMessages.m131b9f3c7eb9') },
      type: 'DIGITAL',
      year: 2014,
      format: 'Super 35 (4K)',
      get sensor() { return translateUi('uiMessages.ma425502eb2fc') },
      get description() { return translateUi('uiMessages.m0fdbf68729f8') },
      get famousFilms() { return [translateUi('uiMessages.m62bc2287c7b4'), translateUi('uiMessages.mf6664ff7242f'), translateUi('uiMessages.m5fcaab103d77'), translateUi('uiMessages.mdb10b67896f1')] },
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'cooke-s5', 'arri-signature-prime']
    },

    // ==================== 照相机 (CAMERA) ====================
    // ===== Nikon 尼康系列 =====
    {
      id: 'nikon-f3',
      name: 'Nikon F3',
      type: 'CAMERA',
      subtype: 'film-slr',
      brand: 'Nikon',
      year: 1980,
      format: '35mm Film',
      get description() { return translateUi('uiMessages.m25f61986f584') },
      focalLengths: [24, 28, 35, 50, 85, 105, 135, 180],
      apertures: [1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['film-grain', 'warm-tone', 'vintage-color', 'natural-bokeh'],
      promptBase: 'shot on Nikon F3 35mm film camera'
    },
    {
      id: 'nikon-fm2',
      name: 'Nikon FM2',
      type: 'CAMERA',
      subtype: 'film-slr',
      brand: 'Nikon',
      year: 1982,
      format: '35mm Film',
      get description() { return translateUi('uiMessages.m54ba987ba61f') },
      focalLengths: [24, 28, 35, 50, 85, 105, 135],
      apertures: [1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['film-grain', 'warm-tone', 'vintage-color'],
      promptBase: 'shot on Nikon FM2 film camera, classic film photography'
    },
    {
      id: 'nikon-d850',
      name: 'Nikon D850',
      type: 'CAMERA',
      subtype: 'dslr',
      brand: 'Nikon',
      year: 2017,
      format: 'Full Frame (45.7MP)',
      get description() { return translateUi('uiMessages.m8ecc1d6e2c9f') },
      focalLengths: [14, 20, 24, 28, 35, 50, 58, 85, 105, 135, 200],
      apertures: [1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0, 11],
      availableEffects: ['sharp-detail', 'natural-color', 'bokeh'],
      promptBase: 'shot on Nikon D850, professional DSLR photography'
    },
    {
      id: 'nikon-z9',
      name: 'Nikon Z9',
      type: 'CAMERA',
      subtype: 'mirrorless',
      brand: 'Nikon',
      year: 2021,
      format: 'Full Frame (45.7MP)',
      get description() { return translateUi('uiMessages.m2636e729590f') },
      focalLengths: [14, 20, 24, 28, 35, 50, 58, 85, 105, 135, 200, 400],
      apertures: [1.2, 1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['sharp-detail', 'natural-color', 'silky-bokeh'],
      promptBase: 'shot on Nikon Z9, flagship mirrorless camera'
    },
    {
      id: 'nikon-z6-iii',
      name: 'Nikon Z6 III',
      type: 'CAMERA',
      subtype: 'mirrorless',
      brand: 'Nikon',
      year: 2024,
      format: 'Full Frame (24.5MP)',
      get description() { return translateUi('uiMessages.mbcc6f51c9ead') },
      focalLengths: [14, 20, 24, 28, 35, 50, 85, 135],
      apertures: [1.4, 1.8, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['natural-color', 'bokeh', 'low-light'],
      promptBase: 'shot on Nikon Z6 III mirrorless camera'
    },

    // ===== Canon 佳能系列 =====
    {
      id: 'canon-ae1',
      name: 'Canon AE-1',
      type: 'CAMERA',
      subtype: 'film-slr',
      brand: 'Canon',
      year: 1976,
      format: '35mm Film',
      get description() { return translateUi('uiMessages.md119947f1c59') },
      focalLengths: [24, 28, 35, 50, 85, 100, 135, 200],
      apertures: [1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['film-grain', 'vintage-color', 'warm-tone', 'soft-glow'],
      promptBase: 'shot on Canon AE-1 film camera, vintage photography'
    },
    {
      id: 'canon-eos-1v',
      name: 'Canon EOS-1V',
      type: 'CAMERA',
      subtype: 'film-slr',
      brand: 'Canon',
      year: 2000,
      format: '35mm Film',
      get description() { return translateUi('uiMessages.m83468c86d694') },
      focalLengths: [14, 20, 24, 28, 35, 50, 85, 100, 135, 200, 300],
      apertures: [1.2, 1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['film-grain', 'professional-color', 'sharp-detail'],
      promptBase: 'shot on Canon EOS-1V professional film camera'
    },
    {
      id: 'canon-5d-mark-iv',
      name: 'Canon 5D Mark IV',
      type: 'CAMERA',
      subtype: 'dslr',
      brand: 'Canon',
      year: 2016,
      format: 'Full Frame (30.4MP)',
      get description() { return translateUi('uiMessages.mae765c08d534') },
      focalLengths: [16, 24, 35, 50, 85, 100, 135, 200],
      apertures: [1.2, 1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['canon-color', 'natural-skin', 'bokeh'],
      promptBase: 'shot on Canon 5D Mark IV, professional photography'
    },
    {
      id: 'canon-eos-r5',
      name: 'Canon EOS R5',
      type: 'CAMERA',
      subtype: 'mirrorless',
      brand: 'Canon',
      year: 2020,
      format: 'Full Frame (45MP)',
      get description() { return translateUi('uiMessages.me4e0ccdb1dd1') },
      focalLengths: [14, 24, 28, 35, 50, 85, 100, 135, 200],
      apertures: [1.2, 1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['sharp-detail', 'canon-color', 'creamy-bokeh'],
      promptBase: 'shot on Canon EOS R5, flagship mirrorless'
    },
    {
      id: 'canon-eos-r3',
      name: 'Canon EOS R3',
      type: 'CAMERA',
      subtype: 'mirrorless',
      brand: 'Canon',
      year: 2021,
      format: 'Full Frame (24.1MP)',
      get description() { return translateUi('uiMessages.mbde82c3f6377') },
      focalLengths: [14, 24, 35, 50, 85, 135, 200, 400, 600],
      apertures: [1.2, 1.4, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['action-freeze', 'canon-color', 'bokeh'],
      promptBase: 'shot on Canon EOS R3, professional sports photography'
    },

    // ===== Sony 索尼系列 =====
    {
      id: 'sony-a7r-v',
      name: 'Sony A7R V',
      type: 'CAMERA',
      subtype: 'mirrorless',
      brand: 'Sony',
      year: 2022,
      format: 'Full Frame (61MP)',
      get description() { return translateUi('uiMessages.maafc7ba2c458') },
      focalLengths: [12, 14, 20, 24, 35, 50, 85, 100, 135, 200],
      apertures: [1.2, 1.4, 1.8, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['ultra-sharp', 'natural-color', 'silky-bokeh'],
      promptBase: 'shot on Sony A7R V, high resolution photography'
    },
    {
      id: 'sony-a9-iii',
      name: 'Sony A9 III',
      type: 'CAMERA',
      subtype: 'mirrorless',
      brand: 'Sony',
      year: 2023,
      format: 'Full Frame (24.6MP)',
      get description() { return translateUi('uiMessages.m38116de3c274') },
      focalLengths: [14, 24, 35, 50, 70, 85, 135, 200, 400, 600],
      apertures: [1.4, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['action-freeze', 'global-shutter', 'natural-color'],
      promptBase: 'shot on Sony A9 III with global shutter'
    },
    {
      id: 'sony-a7c-ii',
      name: 'Sony A7C II',
      type: 'CAMERA',
      subtype: 'mirrorless',
      brand: 'Sony',
      year: 2023,
      format: 'Full Frame (33MP)',
      get description() { return translateUi('uiMessages.m38c40522f7cb') },
      focalLengths: [20, 24, 35, 40, 50, 85],
      apertures: [1.4, 1.8, 2.0, 2.8, 4.0, 5.6],
      availableEffects: ['street-photo', 'natural-color', 'bokeh'],
      promptBase: 'shot on Sony A7C II, compact full-frame'
    },

    // ===== Fujifilm 富士系列 =====
    {
      id: 'fuji-x100vi',
      name: 'Fujifilm X100VI',
      type: 'CAMERA',
      subtype: 'compact',
      brand: 'Fujifilm',
      year: 2024,
      format: 'APS-C (40.2MP)',
      get description() { return translateUi('uiMessages.ma579e7f5cd5d') },
      focalLengths: [23],
      apertures: [2.0, 2.8, 4.0, 5.6, 8.0, 11, 16],
      availableEffects: ['fuji-film-sim', 'classic-chrome', 'acros', 'velvia', 'provia', 'astia'],
      promptBase: 'shot on Fujifilm X100VI, film simulation'
    },
    {
      id: 'fuji-x-t5',
      name: 'Fujifilm X-T5',
      type: 'CAMERA',
      subtype: 'mirrorless',
      brand: 'Fujifilm',
      year: 2022,
      format: 'APS-C (40.2MP)',
      get description() { return translateUi('uiMessages.md9d1760c29c8') },
      focalLengths: [14, 16, 18, 23, 27, 33, 35, 50, 56, 80, 90],
      apertures: [1.2, 1.4, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['fuji-film-sim', 'classic-chrome', 'classic-neg', 'acros', 'nostalgic-neg'],
      promptBase: 'shot on Fujifilm X-T5 with film simulation'
    },
    {
      id: 'fuji-gfx-100s-ii',
      name: 'Fujifilm GFX100S II',
      type: 'CAMERA',
      subtype: 'medium-format',
      brand: 'Fujifilm',
      year: 2024,
      format: 'Medium Format (102MP)',
      get description() { return translateUi('uiMessages.m844f5b515007') },
      focalLengths: [23, 30, 32, 45, 50, 63, 80, 100, 110, 250],
      apertures: [1.7, 2.0, 2.8, 3.5, 4.0, 5.6, 8.0],
      availableEffects: ['medium-format-look', 'fuji-film-sim', 'ultra-detail', 'shallow-dof'],
      promptBase: 'shot on Fujifilm GFX100S II medium format'
    },

    // ===== Hasselblad 哈苏系列 =====
    {
      id: 'hasselblad-500cm',
      name: 'Hasselblad 500C/M',
      type: 'CAMERA',
      subtype: 'film-medium',
      brand: 'Hasselblad',
      year: 1970,
      format: '6x6cm Film',
      get description() { return translateUi('uiMessages.m987c46517de7') },
      focalLengths: [40, 50, 60, 80, 100, 120, 150, 180, 250],
      apertures: [2.8, 4.0, 5.6, 8.0, 11, 16, 22],
      availableEffects: ['medium-format-film', 'square-format', 'zeiss-rendering', 'film-grain'],
      promptBase: 'shot on Hasselblad 500C/M, medium format film'
    },
    {
      id: 'hasselblad-x2d',
      name: 'Hasselblad X2D 100C',
      type: 'CAMERA',
      subtype: 'medium-format',
      brand: 'Hasselblad',
      year: 2022,
      format: 'Medium Format (100MP)',
      get description() { return translateUi('uiMessages.m1568bb0f29bd') },
      focalLengths: [21, 25, 30, 38, 45, 55, 65, 80, 90, 120],
      apertures: [2.5, 2.8, 3.2, 3.5, 4.0, 5.6, 8.0],
      availableEffects: ['hasselblad-color', 'medium-format-look', 'ultra-detail'],
      promptBase: 'shot on Hasselblad X2D 100C, premium medium format'
    },

    // ===== Leica 徕卡系列 =====
    {
      id: 'leica-m6',
      name: 'Leica M6',
      type: 'CAMERA',
      subtype: 'film-rangefinder',
      brand: 'Leica',
      year: 1984,
      format: '35mm Film',
      get description() { return translateUi('uiMessages.m337e245ced70') },
      focalLengths: [21, 24, 28, 35, 50, 75, 90, 135],
      apertures: [1.4, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['leica-rendering', 'film-grain', 'classic-contrast', 'street-photo'],
      promptBase: 'shot on Leica M6 film camera, street photography'
    },
    {
      id: 'leica-m11',
      name: 'Leica M11',
      type: 'CAMERA',
      subtype: 'rangefinder',
      brand: 'Leica',
      year: 2022,
      format: 'Full Frame (60MP)',
      get description() { return translateUi('uiMessages.m075d2b813bb2') },
      focalLengths: [21, 24, 28, 35, 50, 75, 90, 135],
      apertures: [1.4, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['leica-rendering', 'high-contrast', 'street-photo'],
      promptBase: 'shot on Leica M11, rangefinder photography'
    },
    {
      id: 'leica-q3',
      name: 'Leica Q3',
      type: 'CAMERA',
      subtype: 'compact',
      brand: 'Leica',
      year: 2023,
      format: 'Full Frame (60MP)',
      get description() { return translateUi('uiMessages.m91f361f9502a') },
      focalLengths: [28],
      apertures: [1.7, 2.0, 2.8, 4.0, 5.6, 8.0, 11, 16],
      availableEffects: ['leica-rendering', 'summilux-bokeh', 'street-photo'],
      promptBase: 'shot on Leica Q3 with 28mm Summilux'
    },

    // ===== Pentax 宾得系列 =====
    {
      id: 'pentax-k1000',
      name: 'Pentax K1000',
      type: 'CAMERA',
      subtype: 'film-slr',
      brand: 'Pentax',
      year: 1976,
      format: '35mm Film',
      get description() { return translateUi('uiMessages.mbd85364ea2de') },
      focalLengths: [28, 35, 50, 85, 135, 200],
      apertures: [1.4, 1.7, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['film-grain', 'vintage-color', 'warm-tone'],
      promptBase: 'shot on Pentax K1000 film camera'
    },
    {
      id: 'pentax-67',
      name: 'Pentax 67',
      type: 'CAMERA',
      subtype: 'film-medium',
      brand: 'Pentax',
      year: 1969,
      format: '6x7cm Film',
      get description() { return translateUi('uiMessages.m59f5dc376655') },
      focalLengths: [45, 55, 75, 90, 105, 135, 165, 200, 300],
      apertures: [2.4, 2.8, 4.0, 5.6, 8.0, 11, 16, 22],
      availableEffects: ['medium-format-film', 'portrait-rendering', 'film-grain', 'shallow-dof'],
      promptBase: 'shot on Pentax 67 medium format film'
    },

    // ===== Olympus 奥林巴斯系列 =====
    {
      id: 'olympus-om1',
      name: 'Olympus OM-1',
      type: 'CAMERA',
      subtype: 'film-slr',
      brand: 'Olympus',
      year: 1972,
      format: '35mm Film',
      get description() { return translateUi('uiMessages.m8c0a593737b4') },
      focalLengths: [21, 24, 28, 35, 50, 85, 100, 135, 180],
      apertures: [1.2, 1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['film-grain', 'zuiko-rendering', 'compact-slr'],
      promptBase: 'shot on Olympus OM-1 film camera'
    },

    // ===== CCD时代经典数码相机 =====
    {
      id: 'sony-dsc-rx1',
      name: 'Sony DSC-RX1',
      type: 'CAMERA',
      subtype: 'compact',
      brand: 'Sony',
      year: 2012,
      format: 'Full Frame (24.3MP)',
      get description() { return translateUi('uiMessages.ma223e7232300') },
      focalLengths: [35],
      apertures: [2.0, 2.8, 4.0, 5.6, 8.0, 11, 16],
      availableEffects: ['zeiss-rendering', 'full-frame-compact', 'bokeh'],
      promptBase: 'shot on Sony RX1, full-frame compact camera'
    },
    {
      id: 'ricoh-gr-iii',
      name: 'Ricoh GR III',
      type: 'CAMERA',
      subtype: 'compact',
      brand: 'Ricoh',
      year: 2019,
      format: 'APS-C (24.2MP)',
      get description() { return translateUi('uiMessages.m243f401df2b9') },
      focalLengths: [28],
      apertures: [2.8, 4.0, 5.6, 8.0, 11, 16],
      availableEffects: ['street-photo', 'high-contrast-bw', 'positive-film', 'snap-focus'],
      promptBase: 'shot on Ricoh GR III, street photography'
    },
    {
      id: 'contax-t2',
      name: 'Contax T2',
      type: 'CAMERA',
      subtype: 'film-compact',
      brand: 'Contax',
      year: 1990,
      format: '35mm Film',
      get description() { return translateUi('uiMessages.m1801259a5fa1') },
      focalLengths: [38],
      apertures: [2.8, 4.0, 5.6, 8.0, 11, 16],
      availableEffects: ['film-grain', 'zeiss-rendering', 'premium-compact', 'soft-glow'],
      promptBase: 'shot on Contax T2 film camera, Zeiss lens'
    },
    {
      id: 'nikon-coolpix-p1000',
      name: 'Nikon Coolpix P1000',
      type: 'CAMERA',
      subtype: 'bridge',
      brand: 'Nikon',
      year: 2018,
      format: '1/2.3" (16MP)',
      get description() { return translateUi('uiMessages.ma173462820a3') },
      focalLengths: [24, 35, 50, 100, 200, 500, 1000, 2000, 3000],
      apertures: [2.8, 4.0, 5.6, 8.0],
      availableEffects: ['super-telephoto', 'moon-shot', 'wildlife'],
      promptBase: 'shot on Nikon P1000, extreme telephoto'
    },

    // ==================== 手机 (PHONE) ====================
    // ===== iPhone 系列 =====
    {
      id: 'iphone-15-pro-max',
      name: 'iPhone 15 Pro Max',
      type: 'PHONE',
      brand: 'Apple',
      year: 2023,
      sensor: '48MP Main',
      get description() { return translateUi('uiMessages.md339f18cfc6d') },
      focalLengths: [13, 24, 35, 48, 77, 120],
      apertures: [1.78, 2.2, 2.8],
      availableEffects: ['photographic-styles', 'portrait-mode', 'night-mode', 'cinematic-mode', 'prores-log'],
      promptBase: 'shot on iPhone 15 Pro Max'
    },
    {
      id: 'iphone-14-pro',
      name: 'iPhone 14 Pro',
      type: 'PHONE',
      brand: 'Apple',
      year: 2022,
      sensor: '48MP Main',
      get description() { return translateUi('uiMessages.m2e9689b79d25') },
      focalLengths: [13, 24, 48, 77],
      apertures: [1.78, 2.2, 2.8],
      availableEffects: ['photographic-styles', 'portrait-mode', 'night-mode', 'cinematic-mode'],
      promptBase: 'shot on iPhone 14 Pro'
    },
    {
      id: 'iphone-13-pro',
      name: 'iPhone 13 Pro',
      type: 'PHONE',
      brand: 'Apple',
      year: 2021,
      sensor: '12MP',
      get description() { return translateUi('uiMessages.m1d07096ac0aa') },
      focalLengths: [13, 26, 77],
      apertures: [1.5, 1.8, 2.8],
      availableEffects: ['portrait-mode', 'night-mode', 'cinematic-mode', 'macro'],
      promptBase: 'shot on iPhone 13 Pro'
    },
    {
      id: 'iphone-12-pro',
      name: 'iPhone 12 Pro',
      type: 'PHONE',
      brand: 'Apple',
      year: 2020,
      sensor: '12MP',
      get description() { return translateUi('uiMessages.m72e142b78486') },
      focalLengths: [13, 26, 52],
      apertures: [1.6, 2.0, 2.4],
      availableEffects: ['portrait-mode', 'night-mode', 'deep-fusion'],
      promptBase: 'shot on iPhone 12 Pro'
    },
    {
      id: 'iphone-11-pro',
      name: 'iPhone 11 Pro',
      type: 'PHONE',
      brand: 'Apple',
      year: 2019,
      sensor: '12MP',
      get description() { return translateUi('uiMessages.maea67658c629') },
      focalLengths: [13, 26, 52],
      apertures: [1.8, 2.0, 2.4],
      availableEffects: ['portrait-mode', 'night-mode', 'smart-hdr'],
      promptBase: 'shot on iPhone 11 Pro'
    },
    {
      id: 'iphone-x',
      name: 'iPhone X',
      type: 'PHONE',
      brand: 'Apple',
      year: 2017,
      sensor: '12MP',
      get description() { return translateUi('uiMessages.m1a5dceccd6e9') },
      focalLengths: [28, 52],
      apertures: [1.8, 2.4],
      availableEffects: ['portrait-mode', 'portrait-lighting'],
      promptBase: 'shot on iPhone X'
    },
    {
      id: 'iphone-7-plus',
      name: 'iPhone 7 Plus',
      type: 'PHONE',
      brand: 'Apple',
      year: 2016,
      sensor: '12MP',
      get description() { return translateUi('uiMessages.mdf2eced0b8b9') },
      focalLengths: [28, 56],
      apertures: [1.8, 2.8],
      availableEffects: ['portrait-mode'],
      promptBase: 'shot on iPhone 7 Plus, portrait mode'
    },
    {
      id: 'iphone-4',
      name: 'iPhone 4',
      type: 'PHONE',
      brand: 'Apple',
      year: 2010,
      sensor: '5MP',
      get description() { return translateUi('uiMessages.m7bfa4cdd2523') },
      focalLengths: [30],
      apertures: [2.8],
      availableEffects: ['hdr', 'vintage-phone'],
      promptBase: 'shot on iPhone 4, vintage smartphone photo'
    },

    // ===== Samsung Galaxy 系列 =====
    {
      id: 'samsung-s24-ultra',
      name: 'Samsung Galaxy S24 Ultra',
      type: 'PHONE',
      brand: 'Samsung',
      year: 2024,
      sensor: '200MP Main',
      get description() { return translateUi('uiMessages.m5de488d11e8e') },
      focalLengths: [13, 23, 50, 115],
      apertures: [1.7, 2.2, 2.4, 3.4],
      availableEffects: ['ai-photo', 'nightography', 'portrait-mode', 'expert-raw', '100x-zoom'],
      promptBase: 'shot on Samsung Galaxy S24 Ultra'
    },
    {
      id: 'samsung-s23-ultra',
      name: 'Samsung Galaxy S23 Ultra',
      type: 'PHONE',
      brand: 'Samsung',
      year: 2023,
      sensor: '200MP Main',
      get description() { return translateUi('uiMessages.mfe1459945831') },
      focalLengths: [13, 23, 70, 230],
      apertures: [1.7, 2.2, 2.4, 4.9],
      availableEffects: ['nightography', 'portrait-mode', 'expert-raw', 'space-zoom'],
      promptBase: 'shot on Samsung Galaxy S23 Ultra'
    },
    {
      id: 'samsung-s21-ultra',
      name: 'Samsung Galaxy S21 Ultra',
      type: 'PHONE',
      brand: 'Samsung',
      year: 2021,
      sensor: '108MP Main',
      get description() { return translateUi('uiMessages.maf6b05af0450') },
      focalLengths: [13, 26, 72, 240],
      apertures: [1.8, 2.2, 2.4, 4.9],
      availableEffects: ['portrait-mode', 'night-mode', '100x-zoom'],
      promptBase: 'shot on Samsung Galaxy S21 Ultra'
    },

    // ===== Google Pixel 系列 =====
    {
      id: 'pixel-8-pro',
      name: 'Google Pixel 8 Pro',
      type: 'PHONE',
      brand: 'Google',
      year: 2023,
      sensor: '50MP Main',
      get description() { return translateUi('uiMessages.m44b9a6144a2f') },
      focalLengths: [14, 25, 48, 113],
      apertures: [1.68, 1.95, 2.8],
      availableEffects: ['magic-eraser', 'photo-unblur', 'night-sight', 'astrophotography', 'best-take'],
      promptBase: 'shot on Google Pixel 8 Pro, computational photography'
    },
    {
      id: 'pixel-7-pro',
      name: 'Google Pixel 7 Pro',
      type: 'PHONE',
      brand: 'Google',
      year: 2022,
      sensor: '50MP Main',
      get description() { return translateUi('uiMessages.m64cbd6289504') },
      focalLengths: [14, 25, 48, 120],
      apertures: [1.85, 2.2, 3.5],
      availableEffects: ['magic-eraser', 'night-sight', 'astrophotography', 'real-tone'],
      promptBase: 'shot on Google Pixel 7 Pro'
    },
    {
      id: 'pixel-6-pro',
      name: 'Google Pixel 6 Pro',
      type: 'PHONE',
      brand: 'Google',
      year: 2021,
      sensor: '50MP Main',
      get description() { return translateUi('uiMessages.m8426992e3cf1') },
      focalLengths: [14, 25, 104],
      apertures: [1.85, 2.2, 3.5],
      availableEffects: ['magic-eraser', 'night-sight', 'motion-mode'],
      promptBase: 'shot on Google Pixel 6 Pro'
    },

    // ===== Huawei 华为系列 =====
    {
      id: 'huawei-p60-pro',
      name: 'Huawei P60 Pro',
      type: 'PHONE',
      brand: 'Huawei',
      year: 2023,
      sensor: '48MP Main',
      get description() { return translateUi('uiMessages.m53160d55e76f') },
      focalLengths: [13, 24, 90],
      apertures: [1.4, 2.2, 2.8],
      availableEffects: ['xmage-color', 'variable-aperture', 'night-mode'],
      promptBase: 'shot on Huawei P60 Pro, XMAGE imaging'
    },
    {
      id: 'huawei-mate-60-pro',
      name: 'Huawei Mate 60 Pro',
      type: 'PHONE',
      brand: 'Huawei',
      year: 2023,
      sensor: '50MP Main',
      get description() { return translateUi('uiMessages.m84fd4f5ce04b') },
      focalLengths: [13, 24, 90],
      apertures: [1.4, 2.2, 2.8],
      availableEffects: ['xmage-color', 'portrait-mode', 'night-mode'],
      promptBase: 'shot on Huawei Mate 60 Pro'
    },
    {
      id: 'huawei-p40-pro',
      name: 'Huawei P40 Pro',
      type: 'PHONE',
      brand: 'Huawei',
      year: 2020,
      sensor: '50MP Main',
      get description() { return translateUi('uiMessages.m5db201271510') },
      focalLengths: [18, 23, 125],
      apertures: [1.9, 2.2, 3.4],
      availableEffects: ['leica-color', 'night-mode', 'bokeh'],
      promptBase: 'shot on Huawei P40 Pro, Leica camera'
    },

    // ===== Xiaomi 小米系列 =====
    {
      id: 'xiaomi-14-ultra',
      name: 'Xiaomi 14 Ultra',
      type: 'PHONE',
      brand: 'Xiaomi',
      year: 2024,
      sensor: '50MP 1-inch Main',
      get description() { return translateUi('uiMessages.m0d810bddab9d') },
      focalLengths: [12, 23, 75, 120],
      apertures: [1.63, 1.8, 2.5, 2.5],
      availableEffects: ['leica-authentic', 'leica-vibrant', 'master-lens', 'variable-aperture'],
      promptBase: 'shot on Xiaomi 14 Ultra, Leica Summilux'
    },
    {
      id: 'xiaomi-13-ultra',
      name: 'Xiaomi 13 Ultra',
      type: 'PHONE',
      brand: 'Xiaomi',
      year: 2023,
      sensor: '50MP 1-inch Main',
      get description() { return translateUi('uiMessages.ma9664a652ea4') },
      focalLengths: [12, 23, 75, 120],
      apertures: [1.9, 2.0, 2.5, 3.0],
      availableEffects: ['leica-authentic', 'leica-vibrant', 'ultra-night'],
      promptBase: 'shot on Xiaomi 13 Ultra, Leica camera'
    },

    // ===== OPPO/OnePlus 系列 =====
    {
      id: 'oppo-find-x7-ultra',
      name: 'OPPO Find X7 Ultra',
      type: 'PHONE',
      brand: 'OPPO',
      year: 2024,
      sensor: '50MP Dual Main',
      get description() { return translateUi('uiMessages.m4bfb429f2866') },
      focalLengths: [15, 23, 65, 135],
      apertures: [1.8, 1.95, 2.6, 4.3],
      availableEffects: ['hasselblad-color', 'dual-periscope', 'ultra-night'],
      promptBase: 'shot on OPPO Find X7 Ultra, Hasselblad color'
    },
    {
      id: 'oneplus-12',
      name: 'OnePlus 12',
      type: 'PHONE',
      brand: 'OnePlus',
      year: 2024,
      sensor: '50MP Main',
      get description() { return translateUi('uiMessages.md028112e5ebd') },
      focalLengths: [14, 23, 64],
      apertures: [1.6, 2.0, 2.6],
      availableEffects: ['hasselblad-color', 'portrait-mode', 'night-mode'],
      promptBase: 'shot on OnePlus 12, Hasselblad camera'
    },

    // ===== vivo 系列 =====
    {
      id: 'vivo-x100-ultra',
      name: 'vivo X100 Ultra',
      type: 'PHONE',
      brand: 'vivo',
      year: 2024,
      sensor: '50MP 1-inch Main',
      get description() { return translateUi('uiMessages.m1657738ea81c') },
      focalLengths: [14, 23, 85, 200],
      apertures: [1.75, 2.0, 2.67, 3.7],
      availableEffects: ['zeiss-color', 'zeiss-bokeh', 'super-telephoto', 'night-mode'],
      promptBase: 'shot on vivo X100 Ultra, Zeiss optics'
    },
    {
      id: 'vivo-x90-pro-plus',
      name: 'vivo X90 Pro+',
      type: 'PHONE',
      brand: 'vivo',
      year: 2022,
      sensor: '50MP 1-inch Main',
      get description() { return translateUi('uiMessages.m82a82d4e026e') },
      focalLengths: [14, 23, 50, 90],
      apertures: [1.75, 1.85, 1.6, 2.5],
      availableEffects: ['zeiss-color', 'zeiss-portrait', 'night-mode'],
      promptBase: 'shot on vivo X90 Pro+, Zeiss T* lens'
    },

    // ===== Nokia 诺基亚经典系列 =====
    {
      id: 'nokia-pureview-808',
      name: 'Nokia 808 PureView',
      type: 'PHONE',
      brand: 'Nokia',
      year: 2012,
      sensor: '41MP',
      get description() { return translateUi('uiMessages.mbda5fc7056f4') },
      focalLengths: [26],
      apertures: [2.4],
      availableEffects: ['pureview-oversampling', 'lossless-zoom', 'xenon-flash'],
      promptBase: 'shot on Nokia 808 PureView, 41MP sensor'
    },
    {
      id: 'nokia-lumia-1020',
      name: 'Nokia Lumia 1020',
      type: 'PHONE',
      brand: 'Nokia',
      year: 2013,
      sensor: '41MP',
      get description() { return translateUi('uiMessages.m46fde7e0a677') },
      focalLengths: [26],
      apertures: [2.2],
      availableEffects: ['pureview-oversampling', 'xenon-flash', 'raw-capture'],
      promptBase: 'shot on Nokia Lumia 1020'
    },
    {
      id: 'nokia-n95',
      name: 'Nokia N95',
      type: 'PHONE',
      brand: 'Nokia',
      year: 2007,
      sensor: '5MP',
      get description() { return translateUi('uiMessages.m759951a1f2c1') },
      focalLengths: [35],
      apertures: [2.8],
      availableEffects: ['zeiss-rendering', 'vintage-phone', 'autofocus'],
      promptBase: 'shot on Nokia N95, Carl Zeiss lens'
    },
    {
      id: 'nokia-7650',
      name: 'Nokia 7650',
      type: 'PHONE',
      brand: 'Nokia',
      year: 2002,
      sensor: 'VGA (0.3MP)',
      get description() { return translateUi('uiMessages.m50b50bda2091') },
      focalLengths: [35],
      apertures: [2.8],
      availableEffects: ['retro-phone', 'lo-fi'],
      promptBase: 'shot on Nokia 7650, early camera phone aesthetic'
    },

    // ===== Sony Xperia 系列 =====
    {
      id: 'sony-xperia-1-vi',
      name: 'Sony Xperia 1 VI',
      type: 'PHONE',
      brand: 'Sony',
      year: 2024,
      sensor: '48MP Main',
      get description() { return translateUi('uiMessages.m0c19f4c79ade') },
      focalLengths: [16, 24, 48, 85, 170],
      apertures: [1.9, 2.1, 2.3, 2.8],
      availableEffects: ['alpha-processing', 'eye-af', 'real-time-tracking', 'cinematic-video'],
      promptBase: 'shot on Sony Xperia 1 VI, Alpha camera technology'
    },
    {
      id: 'sony-xperia-pro-i',
      name: 'Sony Xperia PRO-I',
      type: 'PHONE',
      brand: 'Sony',
      year: 2021,
      sensor: '1-inch 12MP',
      get description() { return translateUi('uiMessages.m51f3d93f28d9') },
      focalLengths: [16, 24, 50],
      apertures: [2.0, 2.2, 2.4],
      availableEffects: ['1-inch-sensor', 'zeiss-rendering', 'eye-af'],
      promptBase: 'shot on Sony Xperia PRO-I, 1-inch sensor'
    }
  ],

  // ==================== 镜头 ====================
  lenses: [
    // ===== Zeiss 系列 =====
    {
      id: 'zeiss-master-prime',
      name: 'Zeiss Master Prime',
      brand: 'Zeiss',
      mount: 'PL',
      format: 'Super 35',
      focalLengths: [12, 14, 16, 18, 21, 25, 27, 32, 35, 40, 50, 65, 75, 100, 135],
      // 真实光圈数据：12-75mm为T1.3，100-135mm为T2.0
      apertureByFocal: {
        12: { max: 1.3, min: 22 },
        14: { max: 1.3, min: 22 },
        16: { max: 1.3, min: 22 },
        18: { max: 1.3, min: 22 },
        21: { max: 1.3, min: 22 },
        25: { max: 1.3, min: 22 },
        27: { max: 1.3, min: 22 },
        32: { max: 1.3, min: 22 },
        35: { max: 1.3, min: 22 },
        40: { max: 1.3, min: 22 },
        50: { max: 1.3, min: 22 },
        65: { max: 1.3, min: 22 },
        75: { max: 1.3, min: 22 },
        100: { max: 2.0, min: 22 },
        135: { max: 2.0, min: 22 }
      },
      characteristics: {
        sharpness: 'extremely high',
        contrast: 'high',
        colorRendition: 'neutral',
        bokeh: 'smooth circular',
        flare: 'minimal', // 几乎无炫光
        distortion: 'very low'
      },
      // 可用特效：Zeiss Master Prime 以锐利和低炫光著称
      availableEffects: ['bokeh'],
      get description() { return translateUi('uiMessages.m7e857d985db1') }
    },
    {
      id: 'zeiss-ultra-prime',
      name: 'Zeiss Ultra Prime',
      brand: 'Zeiss',
      mount: 'PL',
      format: 'Super 35',
      focalLengths: [8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 50, 65, 85, 100, 135, 180],
      apertureByFocal: {
        8: { max: 2.8, min: 22 },
        10: { max: 2.1, min: 22 },
        12: { max: 2.0, min: 22 },
        14: { max: 1.9, min: 22 },
        16: { max: 1.9, min: 22 },
        20: { max: 1.9, min: 22 },
        24: { max: 1.9, min: 22 },
        28: { max: 1.9, min: 22 },
        32: { max: 1.9, min: 22 },
        40: { max: 1.9, min: 22 },
        50: { max: 1.9, min: 22 },
        65: { max: 1.9, min: 22 },
        85: { max: 1.9, min: 22 },
        100: { max: 1.9, min: 22 },
        135: { max: 1.9, min: 22 },
        180: { max: 1.9, min: 22 }
      },
      characteristics: {
        sharpness: 'high',
        contrast: 'medium-high',
        colorRendition: 'neutral',
        bokeh: 'smooth',
        flare: 'controlled',
        distortion: 'low'
      },
      availableEffects: ['bokeh'],
      get description() { return translateUi('uiMessages.m7ed405616b16') }
    },
    {
      id: 'zeiss-supreme-prime',
      name: 'Zeiss Supreme Prime',
      brand: 'Zeiss',
      mount: 'PL',
      format: 'Full Frame',
      focalLengths: [15, 18, 21, 25, 29, 35, 40, 50, 65, 85, 100, 135, 150, 200],
      apertureByFocal: {
        15: { max: 1.8, min: 22 },
        18: { max: 1.5, min: 22 },
        21: { max: 1.5, min: 22 },
        25: { max: 1.5, min: 22 },
        29: { max: 1.5, min: 22 },
        35: { max: 1.5, min: 22 },
        40: { max: 1.5, min: 22 },
        50: { max: 1.5, min: 22 },
        65: { max: 1.5, min: 22 },
        85: { max: 1.5, min: 22 },
        100: { max: 1.5, min: 22 },
        135: { max: 1.8, min: 22 },
        150: { max: 2.1, min: 22 },
        200: { max: 2.1, min: 22 }
      },
      characteristics: {
        sharpness: 'high',
        contrast: 'medium',
        colorRendition: 'warm neutral',
        bokeh: 'creamy smooth',
        flare: 'gentle warm flare',
        distortion: 'very low'
      },
      availableEffects: ['bokeh', 'gentle-flare'],
      get description() { return translateUi('uiMessages.m24e22b857bb0') }
    },
    {
      id: 'zeiss-cp3',
      name: 'Zeiss CP.3',
      brand: 'Zeiss',
      mount: 'PL/EF/E',
      format: 'Full Frame',
      focalLengths: [15, 18, 21, 25, 28, 35, 50, 85, 100, 135],
      apertureByFocal: {
        15: { max: 2.9, min: 22 },
        18: { max: 2.9, min: 22 },
        21: { max: 2.9, min: 22 },
        25: { max: 2.1, min: 22 },
        28: { max: 2.1, min: 22 },
        35: { max: 2.1, min: 22 },
        50: { max: 2.1, min: 22 },
        85: { max: 2.1, min: 22 },
        100: { max: 2.1, min: 22 },
        135: { max: 2.1, min: 22 }
      },
      characteristics: {
        sharpness: 'high',
        contrast: 'medium-high',
        colorRendition: 'neutral',
        bokeh: 'smooth',
        flare: 'minimal',
        distortion: 'low'
      },
      availableEffects: ['bokeh'],
      get description() { return translateUi('uiMessages.mf94fb2f9b1df') }
    },

    // ===== Cooke 系列 =====
    {
      id: 'cooke-s4',
      name: 'Cooke S4/i',
      brand: 'Cooke',
      mount: 'PL',
      format: 'Super 35',
      focalLengths: [12, 14, 16, 18, 21, 25, 27, 32, 35, 40, 50, 65, 75, 100, 135],
      // S4/i 全系列为 T2.0
      apertureByFocal: {
        12: { max: 2.0, min: 22 },
        14: { max: 2.0, min: 22 },
        16: { max: 2.0, min: 22 },
        18: { max: 2.0, min: 22 },
        21: { max: 2.0, min: 22 },
        25: { max: 2.0, min: 22 },
        27: { max: 2.0, min: 22 },
        32: { max: 2.0, min: 22 },
        35: { max: 2.0, min: 22 },
        40: { max: 2.0, min: 22 },
        50: { max: 2.0, min: 22 },
        65: { max: 2.0, min: 22 },
        75: { max: 2.0, min: 22 },
        100: { max: 2.0, min: 22 },
        135: { max: 2.0, min: 22 }
      },
      characteristics: {
        sharpness: 'medium-high',
        contrast: 'medium',
        colorRendition: 'warm (Cooke Look)',
        bokeh: 'smooth organic',
        flare: 'warm gentle',
        distortion: 'low'
      },
      // 著名的 "Cooke Look" - 温暖肤色，柔和过渡
      availableEffects: ['cooke-look', 'warm-tone', 'soft-skin', 'bokeh'],
      get description() { return translateUi('uiMessages.m66c7dcf3ea48') }
    },
    {
      id: 'cooke-s5',
      name: 'Cooke S5/i',
      brand: 'Cooke',
      mount: 'PL',
      format: 'Full Frame',
      focalLengths: [18, 25, 32, 40, 50, 65, 75, 100, 135],
      apertureByFocal: {
        18: { max: 1.4, min: 22 },
        25: { max: 1.4, min: 22 },
        32: { max: 1.4, min: 22 },
        40: { max: 1.4, min: 22 },
        50: { max: 1.4, min: 22 },
        65: { max: 1.4, min: 22 },
        75: { max: 1.4, min: 22 },
        100: { max: 1.4, min: 22 },
        135: { max: 1.4, min: 22 }
      },
      characteristics: {
        sharpness: 'medium-high',
        contrast: 'medium',
        colorRendition: 'warm (Cooke Look)',
        bokeh: 'smooth organic',
        flare: 'warm gentle',
        distortion: 'very low'
      },
      availableEffects: ['cooke-look', 'warm-tone', 'soft-skin', 'bokeh'],
      get description() { return translateUi('uiMessages.md524148adbca') }
    },
    {
      id: 'cooke-s7',
      name: 'Cooke S7/i',
      brand: 'Cooke',
      mount: 'PL',
      format: 'Full Frame+',
      focalLengths: [18, 25, 32, 40, 50, 75, 100, 135],
      apertureByFocal: {
        18: { max: 2.0, min: 22 },
        25: { max: 2.0, min: 22 },
        32: { max: 2.0, min: 22 },
        40: { max: 2.0, min: 22 },
        50: { max: 2.0, min: 22 },
        75: { max: 2.0, min: 22 },
        100: { max: 2.0, min: 22 },
        135: { max: 2.0, min: 22 }
      },
      characteristics: {
        sharpness: 'medium-high',
        contrast: 'medium',
        colorRendition: 'warm (Cooke Look)',
        bokeh: 'exceptionally smooth',
        flare: 'warm gentle',
        distortion: 'very low'
      },
      availableEffects: ['cooke-look', 'warm-tone', 'soft-skin', 'bokeh'],
      get description() { return translateUi('uiMessages.mc8cc911d67ea') }
    },
    {
      id: 'cooke-anamorphic-i',
      name: 'Cooke Anamorphic/i',
      brand: 'Cooke',
      mount: 'PL',
      format: 'Super 35 Anamorphic',
      isAnamorphic: true,
      anamorphicRatio: 2.0,
      focalLengths: [25, 32, 40, 50, 65, 75, 100, 135, 180],
      apertureByFocal: {
        25: { max: 2.3, min: 22 },
        32: { max: 2.3, min: 22 },
        40: { max: 2.3, min: 22 },
        50: { max: 2.3, min: 22 },
        65: { max: 2.3, min: 22 },
        75: { max: 2.3, min: 22 },
        100: { max: 2.3, min: 22 },
        135: { max: 2.3, min: 22 },
        180: { max: 2.8, min: 22 }
      },
      characteristics: {
        sharpness: 'medium',
        contrast: 'medium',
        colorRendition: 'warm',
        bokeh: 'oval (anamorphic)',
        flare: 'horizontal streak (anamorphic)',
        distortion: 'anamorphic barrel'
      },
      // 变形镜头特有效果
      availableEffects: ['anamorphic-flare', 'anamorphic-bokeh', 'horizontal-streak', 'cooke-look', 'warm-tone'],
      get description() { return translateUi('uiMessages.mcae366a4aa1e') }
    },

    // ===== Canon 系列 =====
    {
      id: 'canon-k35',
      name: 'Canon K-35',
      brand: 'Canon',
      mount: 'PL',
      format: 'Super 35',
      vintage: true,
      year: '1976',
      focalLengths: [18, 24, 35, 55, 85],
      // K-35 经典规格
      apertureByFocal: {
        18: { max: 1.5, min: 16 },
        24: { max: 1.4, min: 16 },
        35: { max: 1.4, min: 16 },
        55: { max: 1.2, min: 16 }, // 55mm是唯一的T1.2
        85: { max: 1.4, min: 16 }
      },
      characteristics: {
        sharpness: 'medium (vintage)',
        contrast: 'low-medium',
        colorRendition: 'warm vintage',
        bokeh: 'soft dreamy',
        flare: 'rainbow/prismatic flare', // 著名的彩虹炫光
        distortion: 'moderate'
      },
      // K-35 以独特的彩虹炫光和复古柔焦著称
      availableEffects: ['rainbow-flare', 'vintage-soft', 'dreamy-bokeh', 'warm-tone', 'low-contrast'],
      get description() { return translateUi('uiMessages.mf9dbaba5ba3d') }
    },
    {
      id: 'canon-sumire',
      name: 'Canon Sumire Prime',
      brand: 'Canon',
      mount: 'PL',
      format: 'Full Frame',
      focalLengths: [14, 20, 24, 35, 50, 85, 135],
      apertureByFocal: {
        14: { max: 3.1, min: 22 },
        20: { max: 1.5, min: 22 },
        24: { max: 1.5, min: 22 },
        35: { max: 1.5, min: 22 },
        50: { max: 1.3, min: 22 },
        85: { max: 1.3, min: 22 },
        135: { max: 2.5, min: 22 }
      },
      characteristics: {
        sharpness: 'medium-high',
        contrast: 'medium',
        colorRendition: 'warm',
        bokeh: 'smooth organic',
        flare: 'warm gentle',
        distortion: 'low'
      },
      availableEffects: ['warm-tone', 'soft-skin', 'bokeh', 'gentle-flare'],
      get description() { return translateUi('uiMessages.mb09c2c4aeeb0') }
    },

    // ===== ARRI 系列 =====
    {
      id: 'arri-signature-prime',
      name: 'ARRI Signature Prime',
      brand: 'ARRI',
      mount: 'LPL',
      format: 'Large Format',
      focalLengths: [12, 15, 18, 21, 25, 29, 35, 40, 47, 58, 75, 95, 125, 150, 200, 280],
      apertureByFocal: {
        12: { max: 1.8, min: 22 },
        15: { max: 1.8, min: 22 },
        18: { max: 1.8, min: 22 },
        21: { max: 1.8, min: 22 },
        25: { max: 1.8, min: 22 },
        29: { max: 1.8, min: 22 },
        35: { max: 1.8, min: 22 },
        40: { max: 1.8, min: 22 },
        47: { max: 1.8, min: 22 },
        58: { max: 1.8, min: 22 },
        75: { max: 1.8, min: 22 },
        95: { max: 1.8, min: 22 },
        125: { max: 1.8, min: 22 },
        150: { max: 2.0, min: 22 },
        200: { max: 2.5, min: 22 },
        280: { max: 2.8, min: 22 }
      },
      characteristics: {
        sharpness: 'medium-high',
        contrast: 'medium',
        colorRendition: 'natural pleasing',
        bokeh: 'silky smooth',
        flare: 'subtle warm',
        distortion: 'very low'
      },
      availableEffects: ['silky-bokeh', 'natural-skin', 'subtle-flare', 'warm-tone'],
      get description() { return translateUi('uiMessages.me31bb39ff0a2') }
    },
    {
      id: 'arri-master-anamorphic',
      name: 'ARRI Master Anamorphic',
      brand: 'ARRI',
      mount: 'PL',
      format: 'Super 35 Anamorphic',
      isAnamorphic: true,
      anamorphicRatio: 2.0,
      focalLengths: [28, 35, 40, 50, 60, 75, 100, 135, 180],
      apertureByFocal: {
        28: { max: 1.9, min: 22 },
        35: { max: 1.9, min: 22 },
        40: { max: 1.9, min: 22 },
        50: { max: 1.9, min: 22 },
        60: { max: 1.9, min: 22 },
        75: { max: 1.9, min: 22 },
        100: { max: 1.9, min: 22 },
        135: { max: 1.9, min: 22 },
        180: { max: 1.9, min: 22 }
      },
      characteristics: {
        sharpness: 'high',
        contrast: 'medium-high',
        colorRendition: 'neutral',
        bokeh: 'oval (anamorphic)',
        flare: 'controlled horizontal streak',
        distortion: 'minimal anamorphic'
      },
      availableEffects: ['anamorphic-flare', 'anamorphic-bokeh', 'horizontal-streak'],
      get description() { return translateUi('uiMessages.mc526c1f59137') }
    },
    {
      id: 'arri-prime-65',
      name: 'ARRI Prime 65',
      brand: 'ARRI',
      mount: 'XPL',
      format: '65mm',
      focalLengths: [28, 35, 50, 75, 100, 150, 300],
      apertureByFocal: {
        28: { max: 1.7, min: 22 },
        35: { max: 1.7, min: 22 },
        50: { max: 1.7, min: 22 },
        75: { max: 1.7, min: 22 },
        100: { max: 1.7, min: 22 },
        150: { max: 2.0, min: 22 },
        300: { max: 2.8, min: 22 }
      },
      characteristics: {
        sharpness: 'high',
        contrast: 'medium-high',
        colorRendition: 'natural',
        bokeh: 'extremely smooth',
        flare: 'minimal',
        distortion: 'very low'
      },
      availableEffects: ['large-format-bokeh', 'shallow-dof'],
      get description() { return translateUi('uiMessages.m845f3f497581') }
    },
    {
      id: 'arri-prime-dna',
      name: 'ARRI Prime DNA',
      brand: 'ARRI',
      mount: 'XPL',
      format: '65mm',
      vintage: true,
      focalLengths: [28, 35, 50, 80, 100, 135, 200],
      apertureByFocal: {
        28: { max: 2.0, min: 22 },
        35: { max: 2.0, min: 22 },
        50: { max: 2.0, min: 22 },
        80: { max: 2.0, min: 22 },
        100: { max: 2.0, min: 22 },
        135: { max: 2.0, min: 22 },
        200: { max: 2.8, min: 22 }
      },
      characteristics: {
        sharpness: 'medium (vintage)',
        contrast: 'low-medium',
        colorRendition: 'vintage warm',
        bokeh: 'organic vintage',
        flare: 'vintage character flare',
        distortion: 'vintage character'
      },
      availableEffects: ['vintage-character', 'organic-flare', 'warm-tone', 'soft-glow'],
      get description() { return translateUi('uiMessages.m5611096273a1') }
    },

    // ===== Panavision 系列 =====
    {
      id: 'panavision-primo',
      name: 'Panavision Primo',
      brand: 'Panavision',
      mount: 'PV',
      format: 'Super 35',
      focalLengths: [10, 14.5, 17.5, 21, 27, 35, 40, 50, 65, 75, 85, 100, 125, 150],
      apertureByFocal: {
        10: { max: 1.9, min: 22 },
        14.5: { max: 1.9, min: 22 },
        17.5: { max: 1.9, min: 22 },
        21: { max: 1.9, min: 22 },
        27: { max: 1.9, min: 22 },
        35: { max: 1.9, min: 22 },
        40: { max: 1.9, min: 22 },
        50: { max: 1.9, min: 22 },
        65: { max: 1.9, min: 22 },
        75: { max: 1.9, min: 22 },
        85: { max: 1.9, min: 22 },
        100: { max: 1.9, min: 22 },
        125: { max: 1.9, min: 22 },
        150: { max: 1.9, min: 22 }
      },
      characteristics: {
        sharpness: 'high',
        contrast: 'medium-high',
        colorRendition: 'neutral balanced',
        bokeh: 'smooth',
        flare: 'controlled',
        distortion: 'very low'
      },
      availableEffects: ['bokeh', 'clean-image'],
      get description() { return translateUi('uiMessages.m9efbea204549') }
    },
    {
      id: 'panavision-primo-70',
      name: 'Panavision Primo 70',
      brand: 'Panavision',
      mount: 'PV',
      format: 'Large Format',
      focalLengths: [27, 35, 40, 50, 65, 80, 100, 125, 150, 200],
      apertureByFocal: {
        27: { max: 1.9, min: 22 },
        35: { max: 1.9, min: 22 },
        40: { max: 1.9, min: 22 },
        50: { max: 1.9, min: 22 },
        65: { max: 1.9, min: 22 },
        80: { max: 1.9, min: 22 },
        100: { max: 1.9, min: 22 },
        125: { max: 1.9, min: 22 },
        150: { max: 1.9, min: 22 },
        200: { max: 2.8, min: 22 }
      },
      characteristics: {
        sharpness: 'high',
        contrast: 'medium-high',
        colorRendition: 'neutral',
        bokeh: 'smooth large format',
        flare: 'controlled',
        distortion: 'very low'
      },
      availableEffects: ['large-format-bokeh', 'shallow-dof'],
      get description() { return translateUi('uiMessages.mc62903ea7566') }
    },
    {
      id: 'panavision-anamorphic-e',
      name: 'Panavision E-Series Anamorphic',
      brand: 'Panavision',
      mount: 'PV',
      format: 'Super 35 Anamorphic',
      isAnamorphic: true,
      anamorphicRatio: 2.0,
      vintage: true,
      focalLengths: [35, 40, 50, 75, 100],
      apertureByFocal: {
        35: { max: 2.0, min: 16 },
        40: { max: 2.0, min: 16 },
        50: { max: 2.0, min: 16 },
        75: { max: 2.0, min: 16 },
        100: { max: 2.0, min: 16 }
      },
      characteristics: {
        sharpness: 'medium (vintage)',
        contrast: 'low-medium',
        colorRendition: 'warm vintage',
        bokeh: 'oval vintage',
        flare: 'dramatic blue streak', // 著名的蓝色拉丝炫光
        distortion: 'anamorphic mumps'
      },
      availableEffects: ['blue-streak-flare', 'anamorphic-bokeh', 'vintage-anamorphic', 'mumps-distortion'],
      get description() { return translateUi('uiMessages.ma4906138acc5') }
    },
    {
      id: 'panavision-anamorphic-g',
      name: 'Panavision G-Series Anamorphic',
      brand: 'Panavision',
      mount: 'PV',
      format: 'Super 35 Anamorphic',
      isAnamorphic: true,
      anamorphicRatio: 2.0,
      focalLengths: [35, 40, 50, 65, 75, 100, 135, 150, 180],
      apertureByFocal: {
        35: { max: 2.8, min: 22 },
        40: { max: 2.8, min: 22 },
        50: { max: 2.8, min: 22 },
        65: { max: 2.8, min: 22 },
        75: { max: 2.8, min: 22 },
        100: { max: 2.8, min: 22 },
        135: { max: 2.8, min: 22 },
        150: { max: 2.8, min: 22 },
        180: { max: 2.8, min: 22 }
      },
      characteristics: {
        sharpness: 'medium-high',
        contrast: 'medium',
        colorRendition: 'neutral',
        bokeh: 'oval smooth',
        flare: 'horizontal streak',
        distortion: 'anamorphic'
      },
      availableEffects: ['anamorphic-flare', 'anamorphic-bokeh', 'horizontal-streak'],
      get description() { return translateUi('uiMessages.mcb4dbda09332') }
    },

    // ===== Leica 系列 =====
    {
      id: 'leica-summilux-c',
      name: 'Leica Summilux-C',
      brand: 'Leica',
      mount: 'PL',
      format: 'Full Frame',
      focalLengths: [16, 18, 21, 25, 29, 35, 40, 50, 65, 75, 100],
      apertureByFocal: {
        16: { max: 1.4, min: 16 },
        18: { max: 1.4, min: 16 },
        21: { max: 1.4, min: 16 },
        25: { max: 1.4, min: 16 },
        29: { max: 1.4, min: 16 },
        35: { max: 1.4, min: 16 },
        40: { max: 1.4, min: 16 },
        50: { max: 1.4, min: 16 },
        65: { max: 1.4, min: 16 },
        75: { max: 1.4, min: 16 },
        100: { max: 1.4, min: 16 }
      },
      characteristics: {
        sharpness: 'high',
        contrast: 'medium-high',
        colorRendition: 'Leica look',
        bokeh: 'creamy swirly',
        flare: 'warm organic',
        distortion: 'low'
      },
      availableEffects: ['leica-look', 'creamy-bokeh', 'warm-flare', 'high-contrast'],
      get description() { return translateUi('uiMessages.m48a9a3adde5b') }
    },
    {
      id: 'leica-thalia',
      name: 'Leica Thalia',
      brand: 'Leica',
      mount: 'PL/LPL',
      format: 'Large Format',
      focalLengths: [24, 30, 35, 45, 55, 70, 90, 100, 120, 180],
      apertureByFocal: {
        24: { max: 3.6, min: 22 },
        30: { max: 2.0, min: 22 },
        35: { max: 2.0, min: 22 },
        45: { max: 2.0, min: 22 },
        55: { max: 2.0, min: 22 },
        70: { max: 2.0, min: 22 },
        90: { max: 2.0, min: 22 },
        100: { max: 2.0, min: 22 },
        120: { max: 2.0, min: 22 },
        180: { max: 3.2, min: 22 }
      },
      characteristics: {
        sharpness: 'medium-high',
        contrast: 'medium',
        colorRendition: 'classic Leica',
        bokeh: 'smooth large format',
        flare: 'organic warm',
        distortion: 'low'
      },
      availableEffects: ['leica-look', 'large-format-bokeh', 'warm-tone'],
      get description() { return translateUi('uiMessages.m92c1ba307a3f') }
    },

    // ===== Sigma 系列 =====
    {
      id: 'sigma-cine-ff',
      name: 'Sigma Cine FF High Speed',
      brand: 'Sigma',
      mount: 'PL/EF/E',
      format: 'Full Frame',
      focalLengths: [14, 20, 24, 28, 35, 40, 50, 85, 105, 135],
      apertureByFocal: {
        14: { max: 1.8, min: 16 },
        20: { max: 1.4, min: 16 },
        24: { max: 1.4, min: 16 },
        28: { max: 1.4, min: 16 },
        35: { max: 1.4, min: 16 },
        40: { max: 1.4, min: 16 },
        50: { max: 1.4, min: 16 },
        85: { max: 1.4, min: 16 },
        105: { max: 1.4, min: 16 },
        135: { max: 1.8, min: 16 }
      },
      characteristics: {
        sharpness: 'very high',
        contrast: 'high',
        colorRendition: 'neutral modern',
        bokeh: 'smooth',
        flare: 'minimal',
        distortion: 'low'
      },
      availableEffects: ['bokeh', 'sharp-image'],
      get description() { return translateUi('uiMessages.m48cf7132ae36') }
    },

    // ===== Sony 系列 =====
    {
      id: 'sony-cinealta',
      name: 'Sony CineAlta',
      brand: 'Sony',
      mount: 'PL/E',
      format: 'Full Frame',
      focalLengths: [20, 24, 35, 50, 85, 135],
      apertureByFocal: {
        20: { max: 2.0, min: 22 },
        24: { max: 2.0, min: 22 },
        35: { max: 2.0, min: 22 },
        50: { max: 2.0, min: 22 },
        85: { max: 2.0, min: 22 },
        135: { max: 2.0, min: 22 }
      },
      characteristics: {
        sharpness: 'high',
        contrast: 'medium-high',
        colorRendition: 'neutral',
        bokeh: 'smooth',
        flare: 'controlled',
        distortion: 'very low'
      },
      availableEffects: ['bokeh', 'clean-image'],
      get description() { return translateUi('uiMessages.m380515464587') }
    },

    // ===== DZOFilm 系列 =====
    {
      id: 'dzofilm-vespid',
      name: 'DZOFilm Vespid',
      brand: 'DZOFilm',
      mount: 'PL/EF',
      format: 'Full Frame',
      focalLengths: [16, 21, 25, 35, 50, 75, 90, 100, 125],
      apertureByFocal: {
        16: { max: 2.8, min: 22 },
        21: { max: 2.1, min: 22 },
        25: { max: 2.1, min: 22 },
        35: { max: 2.1, min: 22 },
        50: { max: 2.1, min: 22 },
        75: { max: 2.1, min: 22 },
        90: { max: 2.8, min: 22 },
        100: { max: 2.1, min: 22 },
        125: { max: 2.8, min: 22 }
      },
      characteristics: {
        sharpness: 'high',
        contrast: 'medium-high',
        colorRendition: 'neutral',
        bokeh: 'smooth',
        flare: 'controlled',
        distortion: 'low'
      },
      availableEffects: ['bokeh'],
      get description() { return translateUi('uiMessages.m91dbeb9503fc') }
    },

    // ===== Hasselblad 系列 (65mm) =====
    {
      id: 'hasselblad-hc',
      name: 'Hasselblad HC',
      brand: 'Hasselblad',
      mount: 'HC',
      format: 'Medium Format',
      focalLengths: [24, 28, 35, 50, 80, 100, 150, 210, 300],
      apertureByFocal: {
        24: { max: 4.8, min: 32 },
        28: { max: 4.0, min: 32 },
        35: { max: 3.5, min: 32 },
        50: { max: 3.5, min: 32 },
        80: { max: 2.8, min: 32 },
        100: { max: 2.2, min: 32 },
        150: { max: 3.2, min: 32 },
        210: { max: 4.0, min: 32 },
        300: { max: 4.5, min: 32 }
      },
      characteristics: {
        sharpness: 'extremely high',
        contrast: 'high',
        colorRendition: 'medium format',
        bokeh: 'smooth',
        flare: 'minimal',
        distortion: 'very low'
      },
      availableEffects: ['medium-format-look', 'shallow-dof'],
      get description() { return translateUi('uiMessages.m0cf7a95375fe') }
    }
  ],

  // ==================== 镜头特效定义 ====================
  lensEffects: {
    // ===== 炫光类 =====
    'rainbow-flare': {
      id: 'rainbow-flare',
      get name() { return translateUi('uiMessages.m701505d4179b') },
      nameEn: 'Rainbow Lens Flare',
      category: 'flare',
      promptSuffix: 'with rainbow prismatic lens flare',
      get description() { return translateUi('uiMessages.m43e45952c777') }
    },
    'anamorphic-flare': {
      id: 'anamorphic-flare',
      get name() { return translateUi('uiMessages.m099b3e37e263') },
      nameEn: 'Anamorphic Lens Flare',
      category: 'flare',
      promptSuffix: 'with anamorphic lens flare',
      get description() { return translateUi('uiMessages.m4ce821a81a72') }
    },
    'horizontal-streak': {
      id: 'horizontal-streak',
      get name() { return translateUi('uiMessages.m4936f1f3eb73') },
      nameEn: 'Horizontal Streak Flare',
      category: 'flare',
      promptSuffix: 'with horizontal streak flare across the frame',
      get description() { return translateUi('uiMessages.m70162dcdf12c') }
    },
    'blue-streak-flare': {
      id: 'blue-streak-flare',
      get name() { return translateUi('uiMessages.m5c6965a32cf7') },
      nameEn: 'Blue Streak Flare',
      category: 'flare',
      promptSuffix: 'with classic blue anamorphic streak flare',
      get description() { return translateUi('uiMessages.m40a892d471c3') }
    },
    'gentle-flare': {
      id: 'gentle-flare',
      get name() { return translateUi('uiMessages.m357052557fe3') },
      nameEn: 'Gentle Flare',
      category: 'flare',
      promptSuffix: 'with subtle warm lens flare',
      get description() { return translateUi('uiMessages.m04249860f271') }
    },
    'warm-flare': {
      id: 'warm-flare',
      get name() { return translateUi('uiMessages.m57f8192e3015') },
      nameEn: 'Warm Flare',
      category: 'flare',
      promptSuffix: 'with warm organic lens flare',
      get description() { return translateUi('uiMessages.mf4de69db18f9') }
    },
    'subtle-flare': {
      id: 'subtle-flare',
      get name() { return translateUi('uiMessages.mf4abace0267b') },
      nameEn: 'Subtle Flare',
      category: 'flare',
      promptSuffix: 'with subtle lens flare',
      get description() { return translateUi('uiMessages.m29fe5fbe1312') }
    },
    'organic-flare': {
      id: 'organic-flare',
      get name() { return translateUi('uiMessages.m1dbfa0338c0f') },
      nameEn: 'Organic Flare',
      category: 'flare',
      promptSuffix: 'with organic vintage flare characteristics',
      get description() { return translateUi('uiMessages.m3ed723ffc0df') }
    },
    'vintage-character': {
      id: 'vintage-character',
      get name() { return translateUi('uiMessages.mcd9ef1277255') },
      nameEn: 'Vintage Character',
      category: 'flare',
      promptSuffix: 'with vintage lens optical characteristics',
      get description() { return translateUi('uiMessages.md3951d90f92d') }
    },

    // ===== 散景类 =====
    'bokeh': {
      id: 'bokeh',
      get name() { return translateUi('uiMessages.mbd11d07f19f0') },
      nameEn: 'Bokeh',
      category: 'bokeh',
      promptSuffix: 'with beautiful bokeh',
      get description() { return translateUi('uiMessages.ma50d84e2736c') }
    },
    'anamorphic-bokeh': {
      id: 'anamorphic-bokeh',
      get name() { return translateUi('uiMessages.m76946668e223') },
      nameEn: 'Anamorphic Oval Bokeh',
      category: 'bokeh',
      promptSuffix: 'with oval anamorphic bokeh',
      get description() { return translateUi('uiMessages.m760cdd620e50') }
    },
    'dreamy-bokeh': {
      id: 'dreamy-bokeh',
      get name() { return translateUi('uiMessages.mb9e1f503221c') },
      nameEn: 'Dreamy Bokeh',
      category: 'bokeh',
      promptSuffix: 'with soft dreamy bokeh',
      get description() { return translateUi('uiMessages.m7272e2fd3a5e') }
    },
    'silky-bokeh': {
      id: 'silky-bokeh',
      get name() { return translateUi('uiMessages.md2213405d14d') },
      nameEn: 'Silky Bokeh',
      category: 'bokeh',
      promptSuffix: 'with silky smooth bokeh',
      get description() { return translateUi('uiMessages.me5801db99ef5') }
    },
    'creamy-bokeh': {
      id: 'creamy-bokeh',
      get name() { return translateUi('uiMessages.m9456da713e03') },
      nameEn: 'Creamy Bokeh',
      category: 'bokeh',
      promptSuffix: 'with creamy swirly bokeh',
      get description() { return translateUi('uiMessages.m84674534f679') }
    },
    'large-format-bokeh': {
      id: 'large-format-bokeh',
      get name() { return translateUi('uiMessages.m2857f0c67197') },
      nameEn: 'Large Format Bokeh',
      category: 'bokeh',
      promptSuffix: 'with large format shallow depth of field bokeh',
      get description() { return translateUi('uiMessages.m71d030e244ea') }
    },
    'shallow-dof': {
      id: 'shallow-dof',
      get name() { return translateUi('uiMessages.m6e656aa607cb') },
      nameEn: 'Shallow Depth of Field',
      category: 'bokeh',
      promptSuffix: 'with extremely shallow depth of field',
      get description() { return translateUi('uiMessages.m8c22b92de8ed') }
    },

    // ===== 色彩风格类 =====
    'cooke-look': {
      id: 'cooke-look',
      name: 'Cooke Look',
      nameEn: 'Cooke Look',
      category: 'style',
      promptSuffix: 'with classic Cooke Look rendering',
      get description() { return translateUi('uiMessages.m659e0e7cba9e') }
    },
    'leica-look': {
      id: 'leica-look',
      name: 'Leica Look',
      nameEn: 'Leica Look',
      category: 'style',
      promptSuffix: 'with distinctive Leica rendering',
      get description() { return translateUi('uiMessages.mf7e3fdb0257a') }
    },
    'warm-tone': {
      id: 'warm-tone',
      get name() { return translateUi('uiMessages.mdd5ac2431376') },
      nameEn: 'Warm Tone',
      category: 'style',
      promptSuffix: 'with warm color tone',
      get description() { return translateUi('uiMessages.m7ea4963a3550') }
    },
    'soft-skin': {
      id: 'soft-skin',
      get name() { return translateUi('uiMessages.md8d55adb9f27') },
      nameEn: 'Soft Skin Rendering',
      category: 'style',
      promptSuffix: 'with pleasing skin tone rendering',
      get description() { return translateUi('uiMessages.m795596d7f58d') }
    },
    'natural-skin': {
      id: 'natural-skin',
      get name() { return translateUi('uiMessages.md2c6f7d744e1') },
      nameEn: 'Natural Skin Tone',
      category: 'style',
      promptSuffix: 'with natural skin tone',
      get description() { return translateUi('uiMessages.mbb7df223f32d') }
    },
    'low-contrast': {
      id: 'low-contrast',
      get name() { return translateUi('uiMessages.m0cb4f5be3c4e') },
      nameEn: 'Low Contrast',
      category: 'style',
      promptSuffix: 'with low contrast cinematic look',
      get description() { return translateUi('uiMessages.md6c29514ed95') }
    },
    'high-contrast': {
      id: 'high-contrast',
      get name() { return translateUi('uiMessages.m8cf6bfa065df') },
      nameEn: 'High Contrast',
      category: 'style',
      promptSuffix: 'with punchy high contrast',
      get description() { return translateUi('uiMessages.m62dda03e6677') }
    },
    'medium-format-look': {
      id: 'medium-format-look',
      get name() { return translateUi('uiMessages.m9fc95b53c834') },
      nameEn: 'Medium Format Look',
      category: 'style',
      promptSuffix: 'with medium format film look',
      get description() { return translateUi('uiMessages.m0b6069ef5709') }
    },

    // ===== 柔焦/复古类 =====
    'vintage-soft': {
      id: 'vintage-soft',
      get name() { return translateUi('uiMessages.me995070a324d') },
      nameEn: 'Vintage Soft Focus',
      category: 'softness',
      promptSuffix: 'with vintage soft focus characteristics',
      get description() { return translateUi('uiMessages.m88c01ee78823') }
    },
    'soft-glow': {
      id: 'soft-glow',
      get name() { return translateUi('uiMessages.m2eb88a373a7f') },
      nameEn: 'Soft Glow',
      category: 'softness',
      promptSuffix: 'with soft halation glow',
      get description() { return translateUi('uiMessages.medc396a43105') }
    },
    'vintage-anamorphic': {
      id: 'vintage-anamorphic',
      get name() { return translateUi('uiMessages.m7498f52f5f07') },
      nameEn: 'Vintage Anamorphic',
      category: 'softness',
      promptSuffix: 'with vintage anamorphic characteristics',
      get description() { return translateUi('uiMessages.me895b5a16f3e') }
    },

    // ===== 畸变类 =====
    'mumps-distortion': {
      id: 'mumps-distortion',
      get name() { return translateUi('uiMessages.m511d1d8fa282') },
      nameEn: 'Anamorphic Mumps',
      category: 'distortion',
      promptSuffix: 'with slight anamorphic mumps distortion at close focus',
      get description() { return translateUi('uiMessages.m7dc487d96a42') }
    },

    // ===== 清晰锐利类 =====
    'sharp-image': {
      id: 'sharp-image',
      get name() { return translateUi('uiMessages.m2940c0bf01c7') },
      nameEn: 'Sharp Image',
      category: 'sharpness',
      promptSuffix: 'with tack sharp image quality',
      get description() { return translateUi('uiMessages.m542119421f2c') }
    },
    'clean-image': {
      id: 'clean-image',
      get name() { return translateUi('uiMessages.m73528b6eec1d') },
      nameEn: 'Clean Image',
      category: 'sharpness',
      promptSuffix: 'with clean clinical image',
      get description() { return translateUi('uiMessages.mab81bf3acbdb') }
    }
  },

  // ==================== 标准光圈档位 ====================
  standardApertureStops: [1.2, 1.3, 1.4, 1.5, 1.7, 1.8, 1.9, 2.0, 2.1, 2.3, 2.8, 3.2, 3.5, 4.0, 4.5, 4.8, 5.6, 6.3, 8.0, 11, 16, 22]
}

/**
 * 根据相机获取兼容的镜头列表
 */
export function getCompatibleLenses(cameraId) {
  const camera = cameraDatabase.cameras.find(c => c.id === cameraId)
  if (!camera) return []
  
  return cameraDatabase.lenses.filter(lens => 
    camera.compatibleLenses.includes(lens.id)
  )
}

/**
 * 根据镜头和焦段获取可用光圈列表
 */
export function getAvailableApertures(lensId, focalLength) {
  const lens = cameraDatabase.lenses.find(l => l.id === lensId)
  if (!lens || !lens.apertureByFocal[focalLength]) {
    return cameraDatabase.standardApertureStops.filter(f => f >= 2.0 && f <= 11)
  }
  
  const { max, min } = lens.apertureByFocal[focalLength]
  return cameraDatabase.standardApertureStops.filter(f => f >= max && f <= min)
}

/**
 * 根据镜头获取可用的特效列表
 */
export function getAvailableEffects(lensId) {
  const lens = cameraDatabase.lenses.find(l => l.id === lensId)
  if (!lens || !lens.availableEffects) return []
  
  return lens.availableEffects.map(effectId => cameraDatabase.lensEffects[effectId]).filter(Boolean)
}

/**
 * 生成相机设置的提示词
 * @param {Object} settings - 相机设置
 * @param {string} settings.cameraName - 相机名称
 * @param {string} settings.lensName - 镜头名称
 * @param {number} settings.focalLength - 焦段
 * @param {number} settings.aperture - 光圈
 * @param {Array} settings.effects - 已选特效ID列表
 * @returns {string} 生成的提示词
 */
export function generateCameraPrompt(settings) {
  const { cameraName, lensName, focalLength, aperture, effects = [], mode = 'cinema', cameraData } = settings
  
  let prompt = ''
  
  // 电影机模式
  if (mode === 'cinema') {
    if (!cameraName || !lensName) return ''
    prompt = `Shot on ${cameraName} with ${lensName}, ${focalLength}mm, f/${aperture}`
    
    // 添加镜头特效提示词
    if (effects.length > 0) {
      const effectPrompts = effects
        .map(effectId => cameraDatabase.lensEffects?.[effectId]?.promptSuffix)
        .filter(Boolean)
      
      if (effectPrompts.length > 0) {
        prompt += ', ' + effectPrompts.join(', ')
      }
    }
  }
  // 照相机模式
  else if (mode === 'camera') {
    if (!cameraName) return ''
    
    // 使用相机的基础提示词（如果有）
    if (cameraData?.promptBase) {
      prompt = cameraData.promptBase
    } else {
      prompt = `Shot on ${cameraName}`
    }
    
    // 添加焦段和光圈
    prompt += `, ${focalLength}mm, f/${aperture}`
    
    // 添加相机特效提示词
    if (effects.length > 0) {
      const effectPrompts = effects
        .map(effectId => cameraEffectsMap[effectId]?.prompt)
        .filter(Boolean)
      
      if (effectPrompts.length > 0) {
        prompt += ', ' + effectPrompts.join(', ')
      }
    }
  }
  // 手机模式
  else if (mode === 'phone') {
    if (!cameraName) return ''
    
    // 使用手机的基础提示词（如果有）
    if (cameraData?.promptBase) {
      prompt = cameraData.promptBase
    } else {
      prompt = `Shot on ${cameraName}`
    }
    
    // 手机通常不强调焦段和光圈数值，但可以添加
    if (focalLength && focalLength !== 24) {
      prompt += `, ${focalLength}mm equivalent`
    }
    
    // 添加手机特效提示词
    if (effects.length > 0) {
      const effectPrompts = effects
        .map(effectId => cameraEffectsMap[effectId]?.prompt)
        .filter(Boolean)
      
      if (effectPrompts.length > 0) {
        prompt += ', ' + effectPrompts.join(', ')
      }
    }
  }
  
  return prompt
}

/**
 * 获取相机类型列表
 */
export function getCameraTypes() {
  return cameraDatabase.cameraTypes || [
    { id: 'FILM', get name() { return translateUi('uiMessages.mb475517b56bf') }, nameEn: 'FILM', icon: '🎞️' },
    { id: 'DIGITAL', get name() { return translateUi('uiMessages.m10f19981cb1d') }, nameEn: 'DIGITAL', icon: '📹' },
    { id: 'CAMERA', get name() { return translateUi('uiMessages.m27efc235b012') }, nameEn: 'CAMERA', icon: '📷' },
    { id: 'PHONE', get name() { return translateUi('uiMessages.m2e07333c8c74') }, nameEn: 'PHONE', icon: '📱' }
  ]
}

/**
 * 按类型获取相机列表
 */
export function getCamerasByType(type) {
  return cameraDatabase.cameras.filter(c => c.type === type)
}

function pickDefaultFocalLength(values = []) {
  if (!values.length) return 35
  if (values.includes(35)) return 35
  return values.reduce((prev, curr) =>
    Math.abs(curr - 35) < Math.abs(prev - 35) ? curr : prev
  )
}

/**
 * 获取指定相机类型的默认设置
 */
export function getDefaultCameraSettingsForType(type = 'CAMERA') {
  const cameraType = getCameraTypes().some(item => item.id === type) ? type : 'CAMERA'
  const camera = getCamerasByType(cameraType)[0] || cameraDatabase.cameras[0]

  if (!camera) {
    return {
      cameraType,
      camera: '',
      lens: '',
      focalLength: 35,
      aperture: 2.0,
      effects: []
    }
  }

  const cinemaMode = cameraType === 'FILM' || cameraType === 'DIGITAL'
  const lens = cinemaMode ? getCompatibleLenses(camera.id)[0] : null
  const focalLengths = lens?.focalLengths || camera.focalLengths || [35]
  const focalLength = pickDefaultFocalLength(focalLengths)
  const apertures = lens
    ? getAvailableApertures(lens.id, focalLength)
    : (camera.apertures || [1.4, 2.0, 2.8, 4.0, 5.6, 8.0])

  return {
    cameraType: camera.type || cameraType,
    camera: camera.id,
    lens: lens?.id || '',
    focalLength,
    aperture: apertures[0] || 2.0,
    effects: []
  }
}

/**
 * 相机特效映射表
 */
const cameraEffectsMap = {
  // 胶片效果
  'film-grain': { id: 'film-grain', get name() { return translateUi('uiMessages.me1be900b4421') }, category: 'style', get description() { return translateUi('uiMessages.m4bb497dfbbeb') }, prompt: 'film grain texture' },
  'warm-tone': { id: 'warm-tone', get name() { return translateUi('uiMessages.mdd5ac2431376') }, category: 'style', get description() { return translateUi('uiMessages.m7ea4963a3550') }, prompt: 'warm color tones' },
  'vintage-color': { id: 'vintage-color', get name() { return translateUi('uiMessages.m02eea86a9a26') }, category: 'style', get description() { return translateUi('uiMessages.mc4f5add726bb') }, prompt: 'vintage color grading' },
  'natural-bokeh': { id: 'natural-bokeh', get name() { return translateUi('uiMessages.m917aadf448ba') }, category: 'bokeh', get description() { return translateUi('uiMessages.m972098708ff7') }, prompt: 'natural bokeh' },
  
  // 数码相机效果
  'sharp-detail': { id: 'sharp-detail', get name() { return translateUi('uiMessages.mec7969f951d8') }, category: 'sharpness', get description() { return translateUi('uiMessages.mc97a4e9942fc') }, prompt: 'sharp details, high resolution' },
  'natural-color': { id: 'natural-color', get name() { return translateUi('uiMessages.m83409cb7cd4b') }, category: 'style', get description() { return translateUi('uiMessages.m45236ec4020f') }, prompt: 'natural color reproduction' },
  'silky-bokeh': { id: 'silky-bokeh', get name() { return translateUi('uiMessages.md2213405d14d') }, category: 'bokeh', get description() { return translateUi('uiMessages.m31bd5303bcf5') }, prompt: 'silky smooth bokeh' },
  'bokeh': { id: 'bokeh', get name() { return translateUi('uiMessages.mbd11d07f19f0') }, category: 'bokeh', get description() { return translateUi('uiMessages.m633264e723e7') }, prompt: 'beautiful bokeh' },
  'creamy-bokeh': { id: 'creamy-bokeh', get name() { return translateUi('uiMessages.m9456da713e03') }, category: 'bokeh', get description() { return translateUi('uiMessages.m8929f09ba754') }, prompt: 'creamy bokeh' },
  'low-light': { id: 'low-light', get name() { return translateUi('uiMessages.m5cc7112e4443') }, category: 'style', get description() { return translateUi('uiMessages.m748662d387de') }, prompt: 'excellent low light performance' },
  
  // 佳能特有
  'canon-color': { id: 'canon-color', get name() { return translateUi('uiMessages.m8c4365a12ed5') }, category: 'style', get description() { return translateUi('uiMessages.m30cd4e5411be') }, prompt: 'Canon color science' },
  'natural-skin': { id: 'natural-skin', get name() { return translateUi('uiMessages.md2c6f7d744e1') }, category: 'style', get description() { return translateUi('uiMessages.md54852fe0707') }, prompt: 'natural flattering skin tones' },
  'action-freeze': { id: 'action-freeze', get name() { return translateUi('uiMessages.mb390519a8b10') }, category: 'style', get description() { return translateUi('uiMessages.maa2567e68603') }, prompt: 'action freeze, high speed capture' },
  
  // 索尼特有
  'ultra-sharp': { id: 'ultra-sharp', get name() { return translateUi('uiMessages.md464d5396c18') }, category: 'sharpness', get description() { return translateUi('uiMessages.mc86cd9461c45') }, prompt: 'ultra sharp details' },
  'global-shutter': { id: 'global-shutter', get name() { return translateUi('uiMessages.m4145f129c574') }, category: 'style', get description() { return translateUi('uiMessages.md408b7805f41') }, prompt: 'global shutter, no rolling shutter artifacts' },
  'street-photo': { id: 'street-photo', get name() { return translateUi('uiMessages.mb08eddf4b290') }, category: 'style', get description() { return translateUi('uiMessages.mc80beb122ea6') }, prompt: 'street photography aesthetic' },
  
  // 富士特有
  'fuji-film-sim': { id: 'fuji-film-sim', get name() { return translateUi('uiMessages.me93a73ed1fe2') }, category: 'style', get description() { return translateUi('uiMessages.m2b975f1ca93b') }, prompt: 'Fujifilm film simulation' },
  'classic-chrome': { id: 'classic-chrome', name: 'Classic Chrome', category: 'style', get description() { return translateUi('uiMessages.m92d2bbfea097') }, prompt: 'Fujifilm Classic Chrome simulation' },
  'classic-neg': { id: 'classic-neg', name: 'Classic Neg', category: 'style', get description() { return translateUi('uiMessages.m92d0de45d7a2') }, prompt: 'Fujifilm Classic Negative simulation' },
  'acros': { id: 'acros', name: 'ACROS', category: 'style', get description() { return translateUi('uiMessages.m017fd87cd8d0') }, prompt: 'Fujifilm ACROS black and white' },
  'velvia': { id: 'velvia', name: 'Velvia', category: 'style', get description() { return translateUi('uiMessages.mf50f83088c9c') }, prompt: 'Fujifilm Velvia vivid colors' },
  'provia': { id: 'provia', name: 'Provia', category: 'style', get description() { return translateUi('uiMessages.mb6c1f4651264') }, prompt: 'Fujifilm Provia standard' },
  'astia': { id: 'astia', name: 'Astia', category: 'style', get description() { return translateUi('uiMessages.md8d55adb9f27') }, prompt: 'Fujifilm Astia soft' },
  'nostalgic-neg': { id: 'nostalgic-neg', name: 'Nostalgic Neg', category: 'style', get description() { return translateUi('uiMessages.m64c99df0afb7') }, prompt: 'Fujifilm Nostalgic Negative' },
  
  // 中画幅效果
  'medium-format-look': { id: 'medium-format-look', get name() { return translateUi('uiMessages.m9fc95b53c834') }, category: 'style', get description() { return translateUi('uiMessages.md202e073a373') }, prompt: 'medium format look, shallow depth of field' },
  'medium-format-film': { id: 'medium-format-film', get name() { return translateUi('uiMessages.mef6274d295ee') }, category: 'style', get description() { return translateUi('uiMessages.m69ef9796a193') }, prompt: 'medium format film look' },
  'ultra-detail': { id: 'ultra-detail', get name() { return translateUi('uiMessages.mc24b0b6400c6') }, category: 'sharpness', get description() { return translateUi('uiMessages.m92e6ff425435') }, prompt: 'ultra high detail, extremely sharp' },
  'shallow-dof': { id: 'shallow-dof', get name() { return translateUi('uiMessages.m6e656aa607cb') }, category: 'bokeh', get description() { return translateUi('uiMessages.mcd59e07da054') }, prompt: 'extremely shallow depth of field' },
  'square-format': { id: 'square-format', get name() { return translateUi('uiMessages.m29b57b8577eb') }, category: 'style', get description() { return translateUi('uiMessages.m52aeca867503') }, prompt: 'square format composition' },
  'zeiss-rendering': { id: 'zeiss-rendering', get name() { return translateUi('uiMessages.m4c33260dd9f2') }, category: 'style', get description() { return translateUi('uiMessages.mcf6c5b7ee8e2') }, prompt: 'Zeiss lens rendering' },
  
  // 哈苏特有
  'hasselblad-color': { id: 'hasselblad-color', get name() { return translateUi('uiMessages.m1c7f6b17b6f3') }, category: 'style', get description() { return translateUi('uiMessages.m246d57a09196') }, prompt: 'Hasselblad Natural Color Solution' },
  
  // 徕卡特有
  'leica-rendering': { id: 'leica-rendering', get name() { return translateUi('uiMessages.mebdf9b21f0a8') }, category: 'style', get description() { return translateUi('uiMessages.m112b1896b4d1') }, prompt: 'Leica lens rendering, classic Leica look' },
  'high-contrast': { id: 'high-contrast', get name() { return translateUi('uiMessages.mdc84753101a8') }, category: 'style', get description() { return translateUi('uiMessages.m8cf6bfa065df') }, prompt: 'high contrast' },
  'summilux-bokeh': { id: 'summilux-bokeh', get name() { return translateUi('uiMessages.mb1ca6a40ad8d') }, category: 'bokeh', get description() { return translateUi('uiMessages.m982066b1318f') }, prompt: 'Summilux lens bokeh' },
  
  // 理光特有
  'high-contrast-bw': { id: 'high-contrast-bw', get name() { return translateUi('uiMessages.m017fd87cd8d0') }, category: 'style', get description() { return translateUi('uiMessages.m017fd87cd8d0') }, prompt: 'high contrast black and white' },
  'positive-film': { id: 'positive-film', get name() { return translateUi('uiMessages.m7031272ebde4') }, category: 'style', get description() { return translateUi('uiMessages.m3c3bdc4f567f') }, prompt: 'positive film colors' },
  'snap-focus': { id: 'snap-focus', get name() { return translateUi('uiMessages.m86dd76bfd42a') }, category: 'style', get description() { return translateUi('uiMessages.mf8d07f2d3803') }, prompt: 'snap focus street photography' },
  
  // 康泰时特有
  'premium-compact': { id: 'premium-compact', get name() { return translateUi('uiMessages.m551dcc21e3a2') }, category: 'style', get description() { return translateUi('uiMessages.m185e95069953') }, prompt: 'premium compact camera quality' },
  'soft-glow': { id: 'soft-glow', get name() { return translateUi('uiMessages.m4839d81f86b0') }, category: 'softness', get description() { return translateUi('uiMessages.m68e4db28a9c3') }, prompt: 'soft glow, gentle highlight bloom' },
  
  // 专业胶片效果
  'professional-color': { id: 'professional-color', get name() { return translateUi('uiMessages.mf55865c055a8') }, category: 'style', get description() { return translateUi('uiMessages.mf62c150baa91') }, prompt: 'professional color accuracy' },
  'zuiko-rendering': { id: 'zuiko-rendering', get name() { return translateUi('uiMessages.m1a44bc4d6854') }, category: 'style', get description() { return translateUi('uiMessages.mde0475910201') }, prompt: 'Olympus Zuiko lens rendering' },
  'compact-slr': { id: 'compact-slr', get name() { return translateUi('uiMessages.m9c91fc6b9e65') }, category: 'style', get description() { return translateUi('uiMessages.m653e0a0eb17b') }, prompt: 'compact SLR photography' },
  'portrait-rendering': { id: 'portrait-rendering', get name() { return translateUi('uiMessages.mefad3379e641') }, category: 'bokeh', get description() { return translateUi('uiMessages.mfba6b14a5a08') }, prompt: 'portrait lens rendering, flattering bokeh' },
  
  // 超长焦效果
  'super-telephoto': { id: 'super-telephoto', get name() { return translateUi('directorStudio.cameraPresets.superTelephoto') }, category: 'style', get description() { return translateUi('uiMessages.m23377c4790bc') }, prompt: 'super telephoto compression' },
  'moon-shot': { id: 'moon-shot', get name() { return translateUi('uiMessages.m0c02f5b74e81') }, category: 'style', get description() { return translateUi('uiMessages.m5875c929d06f') }, prompt: 'moon photography, extreme telephoto' },
  'wildlife': { id: 'wildlife', get name() { return translateUi('uiMessages.md888bd225f2e') }, category: 'style', get description() { return translateUi('uiMessages.m13098395d4a8') }, prompt: 'wildlife photography' },
  
  // ===== 手机特有效果 =====
  // iPhone
  'photographic-styles': { id: 'photographic-styles', get name() { return translateUi('uiMessages.ma212efe2e772') }, category: 'style', get description() { return translateUi('uiMessages.m71e846d49139') }, prompt: 'iPhone Photographic Styles' },
  'portrait-mode': { id: 'portrait-mode', get name() { return translateUi('uiMessages.m03f90b7e1d91') }, category: 'bokeh', get description() { return translateUi('uiMessages.m1321cbf80291') }, prompt: 'portrait mode, computational bokeh' },
  'night-mode': { id: 'night-mode', get name() { return translateUi('uiMessages.me0f0f9fddd9e') }, category: 'style', get description() { return translateUi('uiMessages.m4146f38222dc') }, prompt: 'night mode, computational low light' },
  'cinematic-mode': { id: 'cinematic-mode', get name() { return translateUi('uiMessages.m22adb5de28ea') }, category: 'style', get description() { return translateUi('uiMessages.m63743322200f') }, prompt: 'iPhone Cinematic mode, rack focus' },
  'prores-log': { id: 'prores-log', name: 'ProRes Log', category: 'style', get description() { return translateUi('uiMessages.m37ce77777d5e') }, prompt: 'Apple ProRes Log video' },
  'macro': { id: 'macro', get name() { return translateUi('uiMessages.m3ceac5b44924') }, category: 'style', get description() { return translateUi('uiMessages.m82e2f3ce8197') }, prompt: 'macro photography, extreme close-up' },
  'deep-fusion': { id: 'deep-fusion', name: 'Deep Fusion', category: 'style', get description() { return translateUi('uiMessages.ma4fd51f8dcac') }, prompt: 'Deep Fusion pixel-level optimization' },
  'smart-hdr': { id: 'smart-hdr', name: 'Smart HDR', category: 'style', get description() { return translateUi('uiMessages.md816a0c68b1e') }, prompt: 'Smart HDR, high dynamic range' },
  'portrait-lighting': { id: 'portrait-lighting', get name() { return translateUi('uiMessages.ma8e33328f3d2') }, category: 'style', get description() { return translateUi('uiMessages.mb307017e5403') }, prompt: 'Portrait Lighting effects' },
  'hdr': { id: 'hdr', name: 'HDR', category: 'style', get description() { return translateUi('uiMessages.m63179167d7ea') }, prompt: 'HDR photography' },
  'vintage-phone': { id: 'vintage-phone', get name() { return translateUi('uiMessages.me7188999d342') }, category: 'style', get description() { return translateUi('uiMessages.m34fdbe3356de') }, prompt: 'early smartphone aesthetic, vintage mobile photo' },
  
  // Samsung
  'ai-photo': { id: 'ai-photo', get name() { return translateUi('uiMessages.mf572b6ae2548') }, category: 'style', get description() { return translateUi('uiMessages.m392c72444317') }, prompt: 'AI enhanced photo' },
  'nightography': { id: 'nightography', name: 'Nightography', category: 'style', get description() { return translateUi('uiMessages.m2baa0f592ca7') }, prompt: 'Samsung Nightography, advanced night photography' },
  'expert-raw': { id: 'expert-raw', name: 'Expert RAW', category: 'style', get description() { return translateUi('uiMessages.m1e91f00f1be0') }, prompt: 'Samsung Expert RAW, professional mobile photography' },
  '100x-zoom': { id: '100x-zoom', get name() { return translateUi('uiMessages.m95d77a16a1e0') }, category: 'style', get description() { return translateUi('uiMessages.m99ecc6b152bb') }, prompt: 'Space Zoom 100x telephoto' },
  'space-zoom': { id: 'space-zoom', name: 'Space Zoom', category: 'style', get description() { return translateUi('uiMessages.m111fd187244c') }, prompt: 'Samsung Space Zoom' },
  
  // Google Pixel
  'magic-eraser': { id: 'magic-eraser', name: 'Magic Eraser', category: 'style', get description() { return translateUi('uiMessages.mbdcab6d1bbc5') }, prompt: 'Google Magic Eraser, clean composition' },
  'photo-unblur': { id: 'photo-unblur', name: 'Photo Unblur', category: 'style', get description() { return translateUi('uiMessages.md33f32b60579') }, prompt: 'Photo Unblur, AI sharpening' },
  'night-sight': { id: 'night-sight', name: 'Night Sight', category: 'style', get description() { return translateUi('uiMessages.m1eac2bc1f89c') }, prompt: 'Google Night Sight, computational night photography' },
  'astrophotography': { id: 'astrophotography', get name() { return translateUi('uiMessages.m376f35ca9156') }, category: 'style', get description() { return translateUi('uiMessages.m8d64977e2419') }, prompt: 'astrophotography mode, night sky' },
  'best-take': { id: 'best-take', name: 'Best Take', category: 'style', get description() { return translateUi('uiMessages.md0df1dcd9a88') }, prompt: 'Best Take, AI face optimization' },
  'real-tone': { id: 'real-tone', name: 'Real Tone', category: 'style', get description() { return translateUi('uiMessages.mf757de31519b') }, prompt: 'Real Tone, accurate skin representation' },
  'motion-mode': { id: 'motion-mode', get name() { return translateUi('uiMessages.m9d7be509e5ca') }, category: 'style', get description() { return translateUi('uiMessages.mcab038f8615c') }, prompt: 'Motion Mode, long exposure effect' },
  
  // 华为
  'xmage-color': { id: 'xmage-color', get name() { return translateUi('uiMessages.m7905381e7cef') }, category: 'style', get description() { return translateUi('uiMessages.mb78dd7536d2b') }, prompt: 'Huawei XMAGE color science' },
  'variable-aperture': { id: 'variable-aperture', get name() { return translateUi('uiMessages.m9d61cebf01d9') }, category: 'bokeh', get description() { return translateUi('uiMessages.m653a805b12ca') }, prompt: 'variable aperture, adjustable depth of field' },
  'leica-color': { id: 'leica-color', get name() { return translateUi('uiMessages.me75d64d7aa05') }, category: 'style', get description() { return translateUi('uiMessages.m87bb14c61691') }, prompt: 'Huawei Leica color mode' },
  
  // 小米
  'leica-authentic': { id: 'leica-authentic', name: 'Leica Authentic', category: 'style', get description() { return translateUi('uiMessages.m8e25a8450b05') }, prompt: 'Leica Authentic look, classic Leica rendering' },
  'leica-vibrant': { id: 'leica-vibrant', name: 'Leica Vibrant', category: 'style', get description() { return translateUi('uiMessages.m352093aed57b') }, prompt: 'Leica Vibrant, enhanced colors' },
  'master-lens': { id: 'master-lens', get name() { return translateUi('uiMessages.m2cc5658fbd71') }, category: 'style', get description() { return translateUi('uiMessages.maa47bd65a53a') }, prompt: 'Master lens effect' },
  'ultra-night': { id: 'ultra-night', get name() { return translateUi('uiMessages.m82e3928fe177') }, category: 'style', get description() { return translateUi('uiMessages.m984da7314f86') }, prompt: 'Ultra Night mode, extreme low light' },
  
  // OPPO/OnePlus
  'dual-periscope': { id: 'dual-periscope', get name() { return translateUi('uiMessages.meeb19efd34de') }, category: 'style', get description() { return translateUi('uiMessages.m6b3fd5522c2a') }, prompt: 'dual periscope telephoto' },
  
  // vivo
  'zeiss-color': { id: 'zeiss-color', get name() { return translateUi('uiMessages.me0edc707a9cf') }, category: 'style', get description() { return translateUi('uiMessages.m58ce7e7299b6') }, prompt: 'vivo Zeiss color science' },
  'zeiss-bokeh': { id: 'zeiss-bokeh', get name() { return translateUi('uiMessages.me47bb2222450') }, category: 'bokeh', get description() { return translateUi('uiMessages.m46487376bef3') }, prompt: 'Zeiss style bokeh simulation' },
  'zeiss-portrait': { id: 'zeiss-portrait', get name() { return translateUi('uiMessages.mf6bfbe648707') }, category: 'bokeh', get description() { return translateUi('uiMessages.mc0606b0c592d') }, prompt: 'Zeiss Portrait mode' },
  
  // Nokia
  'pureview-oversampling': { id: 'pureview-oversampling', get name() { return translateUi('uiMessages.m892552371e06') }, category: 'style', get description() { return translateUi('uiMessages.mdab4a4ccd52f') }, prompt: 'Nokia PureView oversampling, high resolution downsample' },
  'lossless-zoom': { id: 'lossless-zoom', get name() { return translateUi('uiMessages.m4d16eb864310') }, category: 'style', get description() { return translateUi('uiMessages.m0116725f57fe') }, prompt: 'lossless digital zoom' },
  'xenon-flash': { id: 'xenon-flash', get name() { return translateUi('uiMessages.m6c6875f2484a') }, category: 'style', get description() { return translateUi('uiMessages.m7f9b41feb97f') }, prompt: 'xenon flash lighting' },
  'raw-capture': { id: 'raw-capture', get name() { return translateUi('uiMessages.me4c73ddf0cc2') }, category: 'style', get description() { return translateUi('uiMessages.m19415f9f84ed') }, prompt: 'RAW capture, unprocessed' },
  'autofocus': { id: 'autofocus', get name() { return translateUi('uiMessages.mc673d6ff22f2') }, category: 'style', get description() { return translateUi('uiMessages.m926412aebfcc') }, prompt: 'autofocus camera phone' },
  'retro-phone': { id: 'retro-phone', get name() { return translateUi('uiMessages.me7188999d342') }, category: 'style', get description() { return translateUi('uiMessages.m2047599cbbec') }, prompt: 'retro camera phone aesthetic' },
  'lo-fi': { id: 'lo-fi', name: 'Lo-Fi', category: 'style', get description() { return translateUi('uiMessages.m8c3b6ca75faf') }, prompt: 'lo-fi photography, early digital aesthetic' },
  
  // Sony Xperia
  'alpha-processing': { id: 'alpha-processing', get name() { return translateUi('uiMessages.mf9a94ad8f346') }, category: 'style', get description() { return translateUi('uiMessages.md692860277e3') }, prompt: 'Sony Alpha camera processing' },
  'eye-af': { id: 'eye-af', get name() { return translateUi('uiMessages.m33447c143361') }, category: 'style', get description() { return translateUi('uiMessages.m0fd6644ff390') }, prompt: 'Eye AF tracking' },
  'real-time-tracking': { id: 'real-time-tracking', get name() { return translateUi('uiMessages.m139731ac35e9') }, category: 'style', get description() { return translateUi('uiMessages.mcdc70e772318') }, prompt: 'real-time tracking autofocus' },
  'cinematic-video': { id: 'cinematic-video', get name() { return translateUi('uiMessages.m957c70ebf42b') }, category: 'style', get description() { return translateUi('uiMessages.m984b027556d3') }, prompt: 'cinematic video recording' },
  '1-inch-sensor': { id: '1-inch-sensor', get name() { return translateUi('uiMessages.m5b6624934394') }, category: 'style', get description() { return translateUi('uiMessages.m2d4ca4358be1') }, prompt: '1-inch sensor, large sensor mobile' },
  
  // 全画幅便携
  'full-frame-compact': { id: 'full-frame-compact', get name() { return translateUi('uiMessages.m276a7df9b4df') }, category: 'style', get description() { return translateUi('uiMessages.ma44b68bff04c') }, prompt: 'full-frame compact camera' }
}

/**
 * 获取相机特效列表
 * @param {string[]} effectIds - 特效ID数组
 * @returns {Array} 特效对象数组
 */
export function getCameraEffects(effectIds) {
  if (!effectIds || !Array.isArray(effectIds)) return []
  return effectIds
    .map(id => cameraEffectsMap[id])
    .filter(Boolean)
}
