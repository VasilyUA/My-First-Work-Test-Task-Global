"use strict";
const dirs = {
	source: "src", // папка с исходниками (путь от корня проекта)
	build: "build", // папка с результатом работы (путь от корня проекта)
};

// Определим необходимые инструменты
import fs from "fs";
import gulp from "gulp";
import dartSass from 'sass';
import gulpSass from 'gulp-sass';
const sass = gulpSass(dartSass);
import rename from "gulp-rename";
import sourcemaps from "gulp-sourcemaps";
import postcss from "gulp-postcss";
import autoprefixer from "autoprefixer";
import mqpacker from "css-mqpacker";
import replace from "gulp-replace";
import del from "del";
import browserSync from "browser-sync";
import ghPages from "gulp-gh-pages";
import newer from "gulp-newer";
import imagemin from "gulp-imagemin";
import pngquant from "imagemin-pngquant";
import uglify from "gulp-uglify";
import concat from "gulp-concat";
import cheerio from "gulp-cheerio";
import svgstore from "gulp-svgstore";
import svgmin from "gulp-svgmin";
import notify from "gulp-notify";
import plumber from "gulp-plumber";
import cleanCSS from "gulp-cleancss";
import include from "gulp-file-include"; //inclue
import htmlbeautify from "gulp-html-beautify";
import spritesmith from "gulp.spritesmith";
import merge from "merge-stream";
import buffer from "vinyl-buffer";

// ЗАДАЧА: Компиляция препроцессора
gulp.task("sass", function () {
	const browser = browserSync.create();
	return gulp
		.src(dirs.source + "/sass/style.scss") // какой файл компилировать (путь из константы)
		.pipe(include())
		.pipe(plumber({ errorHandler: onError }))
		.pipe(sourcemaps.init()) // инициируем карту кода
		.pipe(sass()) // компилируем
		.pipe(
			postcss([
				// делаем постпроцессинг
				autoprefixer({
					overrideBrowserslist: [
						"last 2 version",
						"last 7 Chrome versions",
						"last 10 Opera versions",
						"last 7 Firefox versions",
					],
				}), // автопрефиксирование
				mqpacker({ sort: true }), // объединение медиавыражений
			])
		)
		.pipe(sourcemaps.write("/")) // записываем карту кода как отдельный файл (путь из константы)
		.pipe(gulp.dest(dirs.build + "/css/")) // записываем CSS-файл (путь из константы)
		.pipe(browser.stream())
		.pipe(rename("style.min.css")) // переименовываем
		.pipe(cleanCSS()) // сжимаем
		.pipe(gulp.dest(dirs.build + "/css/")); // записываем CSS-файл (путь из константы)
});

// ЗАДАЧА: Сборка HTML
gulp.task("html", function () {
	return gulp
		.src(dirs.source + "/*.html") // какие файлы обрабатывать (путь из константы, маска имени)
		.pipe(include())
		.pipe(htmlbeautify())
		.pipe(plumber({ errorHandler: onError }))
		.pipe(replace(/\n\s*<!--DEV[\s\S]+?-->/gm, "")) // убираем комментарии <!--DEV ... -->
		.pipe(gulp.dest(dirs.build)); // записываем файлы (путь из константы)
});

// ЗАДАЧА: Копирование изображений
gulp.task("img", function () {
	return gulp
		.src(
			[
				dirs.source + "/img/*.{gif,png,jpg,jpeg,svg}", // какие файлы обрабатывать (путь из константы, маска имени, много расширений)
			],
			{ since: gulp.lastRun("img") } // оставим в потоке обработки только изменившиеся от последнего запуска задачи (в этой сессии) файлы
		)
		.pipe(plumber({ errorHandler: onError }))
		.pipe(newer(dirs.build + "/img")) // оставить в потоке только новые файлы (сравниваем с содержимым папки билда)
		.pipe(gulp.dest(dirs.build + "/img")); // записываем файлы (путь из константы)
});

// ЗАДАЧА: Оптимизация изображений (ЗАДАЧА ЗАПУСКАЕТСЯ ТОЛЬКО ВРУЧНУЮ)
gulp.task("img:opt", function () {
	return gulp
		.src([
			dirs.source + "/img/*.{gif,png,jpg,jpeg,svg}", // какие файлы обрабатывать (путь из константы, маска имени, много расширений)
			"!" + dirs.source + "/img/sprite-svg.svg", // SVG-спрайт брать в обработку не будем
		])
		.pipe(plumber({ errorHandler: onError }))
		.pipe(
			imagemin({
				// оптимизируем
				progressive: true,
				svgoPlugins: [{ removeViewBox: false }],
				use: [pngquant()],
			})
		)
		.pipe(gulp.dest(dirs.source + "/img")); // записываем файлы в исходную папку
});

// ЗАДАЧА: Сборка SVG-спрайта
gulp.task("svgstore", function (callback) {
	var spritePath = dirs.source + "/img/svg-sprite"; // переменнач с путем к исходникам SVG-спрайта
	if (fileExist(spritePath) !== false) {
		return (
			gulp
				.src(spritePath + "/*.svg") // берем только SVG файлы из этой папки, подпапки игнорируем
				// .pipe(plumber({ errorHandler: onError }))
				.pipe(
					svgmin(function (file) {
						return {
							plugins: [
								{
									cleanupIDs: {
										minify: true,
									},
								},
							],
						};
					})
				)
				.pipe(svgstore({ inlineSvg: true }))

				.pipe(
					cheerio({
						run: function ($) {
							$("[fill]").removeAttr("fill");
						},
						parserOptions: { xmlMode: true },
					})
				)

				.pipe(rename("sprite-svg.svg"))
				.pipe(gulp.dest(dirs.source + "/img"))
		);
	} else {
		console.log("Нет файлов для сборки SVG-спрайта");
		callback();
	}
});

// ЗАДАЧА: сшивка PNG-спрайта
gulp.task("png:sprite", function () {
	let fileName = "sprite-png" + ".png"; // формируем случайное и уникальное имя файла
	let spriteData = gulp
		.src("src/img/png-sprite/*.png") // получаем список файлов для создания спрайта
		.pipe(plumber({ errorHandler: onError })) // не останавливаем автоматику при ошибках
		.pipe(
			spritesmith({
				// шьем спрайт:
				imgName: fileName, //   - имя файла (сформировано чуть выше)
				cssName: "sprite-png.scss", //   - имя генерируемого стилевого файла (там примеси для комфортного использования частей спрайта)
				padding: 4, //   - отступ между составными частями спрайта
				imgPath: "../img/" + fileName, //   - путь к файлу картинки спрайта (используеися в генерируемом стилевом файле спрайта)
			})
		);
	let imgStream = spriteData.img // оптимизируем и запишем картинку спрайта
		.pipe(buffer())
		.pipe(imagemin())
		.pipe(gulp.dest(dirs.source + "/img"));
	let cssStream = spriteData.css // запишем генерируемый стилевой файл спрайта
		.pipe(gulp.dest(dirs.source + "/sass/blocks"));
	return merge(imgStream, cssStream);
});

// ЗАДАЧА: Очистка папки сборки
gulp.task("clean", function () {
	return del([
		// стираем
		dirs.build + "/**/*", // все файлы из папки сборки (путь из константы)
		"!" + dirs.build + "/readme.md", // кроме readme.md (путь из константы)
	]);
});

// ЗАДАЧА: Конкатенация и углификация Javascript
gulp.task("js", function () {
	return gulp
		.src([
			// список обрабатываемых файлов в нужной последовательности (Запятая после каждого файла, в конце запятая не нужна)
			dirs.source + "/js/script.js",
		])
		.pipe(include()) //Прогоним через include-file
		.pipe(plumber({ errorHandler: onError }))
		.pipe(concat("script.js"))
		.pipe(gulp.dest(dirs.build + "/js"))
		.pipe(rename("script-min.js"))
		.pipe(uglify())
		.pipe(gulp.dest(dirs.build + "/js"))
		.pipe(browserSync.stream());
});

// ЗАДАЧА: Перемещение шрифтов
gulp.task("copy", function () {
	return gulp
		.src(dirs.source + "/fonts/**/*.{woff,woff2}")
		.pipe(gulp.dest("build" + "/fonts"));
});

// ЗАДАЧА: сборка сss-библиотек
gulp.task("copy-css", function () {
	return gulp
		.src(dirs.source + "/css/blueimp-gallery.min.css")
		.pipe(gulp.dest("build" + "/css"));
});

// ЗАДАЧА: Сборка всего
gulp.task(
	"build",
	gulp.series(
		// последовательно:
		"clean", // последовательно: очистку папки сборки
		"svgstore",
		"png:sprite",
		gulp.parallel("sass", "img", "js", "copy"),
		"html"
		// последовательно: сборку разметки
	)
);

// ЗАДАЧА: Локальный сервер, слежение
gulp.task(
	"serve",
	gulp.series("build", function () {
		browserSync.init({
			// запускаем локальный сервер (показ, автообновление, синхронизацию)
			//server: dirs.build,                                     // папка, которая будет «корнем» сервера (путь из константы)
			server: {
				baseDir: "./build/",
			},
			port: 3000, // порт, на котором будет работать сервер
			startPath: "index.html", // файл, который буде открываться в браузере при старте сервера
			// open: false                                          // возможно, каждый раз стартовать сервер не нужно...
		});

		gulp.watch(
			// следим за HTML
			[
				dirs.source + "/**/*.html", // в папке с исходниками
			],
			gulp.series("html", reloader) // при изменении файлов запускаем пересборку HTML и обновление в браузере
		);

		gulp.watch(
			// следим
			dirs.source + "/sass/**/*.scss",
			gulp.series("sass") // при изменении запускаем компиляцию (обновление браузера — в задаче компиляции)
		);

		gulp.watch(
			// следим за SVG
			dirs.source + "/img/svg-sprite/*.svg",
			gulp.series("svgstore", "html", reloader)
		);

		gulp.watch(
			dirs.source + "/img/png-sprite/*.png",
			gulp.series("png:sprite", "sass")
		);

		gulp.watch(
			// следим за изображениями
			dirs.source + "/img/*.{gif,png,jpg,jpeg,svg}",
			gulp.series("img", reloader) // при изменении оптимизируем, копируем и обновляем в браузере
		);

		gulp.watch(
			// следим за JS
			dirs.source + "/js/**/*.js",
			gulp.series("js", reloader) // при изменении пересобираем и обновляем в браузере
		);
	})
);

// ЗАДАЧА, ВЫПОЛНЯЕМАЯ ТОЛЬКО ВРУЧНУЮ: Отправка в GH pages (ветку gh-pages репозитория)
gulp.task("deploy", function () {
	return gulp.src("./build/**/*").pipe(ghPages());
});

// ЗАДАЧА: Задача по умолчанию
gulp.task("default", gulp.series("serve"));

// Дополнительная функция для перезагрузки в браузере
function reloader(done) {
	browserSync.reload();
	done();
}

// Проверка существования файла/папки
function fileExist(path) {
	try {
		fs.statSync(path);
	} catch (err) {
		return !(err && err.code === "ENOENT");
	}
}

var onError = function (err) {
	notify.onError({
		title: "Error in " + err.plugin,
	})(err);
	this.emit("end");
};
