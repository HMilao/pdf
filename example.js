/* eslint-disable no-console */
const ejs = require('ejs');
const fs = require('fs');
const pdf = require('html-pdf');
const uuid = require('uuid');
const moment = require('moment');

exports.index = function (req, res) {
  const template = req.body.template;
  const template_from = `${__dirname}/../ejs/`;
  const template_src = `${template_from + template}.ejs`;
  const pdf_from = `${__dirname}/../pdf/`;
  const pdf_name = `medical-order-${uuid.v4()}.pdf`;
  const pdf_src = pdf_from + pdf_name;
  const render_pdf = true;
  const download_pdf = true;
  const body_data = req.body.data;

  const bodyValidation = async function () {
    return new Promise((resolve) => {
      const template_list = ['medical-order', 'sadt', 'signed'];
      const err = [];

      if (!template) {
        err.push('Template não enviado');
      }

      if (!template_list.includes(template)) {
        err.push('Template inválido');
      }

      if (!body_data) {
        err.push('Data não enviado');
      }

      if (err.length > 0) {
        res.status(400).send({ msg: err });

        return;
      }

      resolve(true);
    });
  };

  const pdfPagination = function (list, howMany) {
    const result = [];

    if (template !== 'sadt') howMany = 100;

    const exams = {
      bloodExamsList: list.filter((b) => {
        return b.blood_exam == true;
      }),
      examsList: list.filter((b) => {
        return b.blood_exam == false;
      }),
      newExamsList: list.filter((b) => {
        return typeof b.blood_exam !== 'boolean';
      }),
    };

    while (exams.bloodExamsList.length > 0) {
      result.push(exams.bloodExamsList.splice(0, howMany));
    }

    while (exams.examsList.length > 0) {
      result.push(exams.examsList.splice(0, howMany));
    }

    while (exams.newExamsList.length > 0) {
      result.push(exams.newExamsList.splice(0, howMany));
    }

    return result;
  };

  const readTemplate = async function (data) {
    return new Promise((resolve) => {
      data.items = pdfPagination(data.items, 5);

      const html = ejs.render(fs.readFileSync(template_src, 'utf-8'), data);

      resolve(html);
    });
  };

  const createPDF = async function (html, data) {
    return new Promise((resolve, reject) => {
      if (!html) {
        reject('No html content');

        return;
      }

      const marginConfig = {
        top: '4.5cm',
        bottom: '20px',
        left: '30px',
        right: '30px',
      };

      let headerConfig = {};

      if (data.preferences) {
        Object.assign(marginConfig, {
          top: data.preferences.marginTop,
          right: data.preferences.marginRight,
          bottom: data.preferences.marginBottom,
          left: data.preferences.marginLeft,
        });

        headerConfig = {
          height: '50mm',
          contents: `<img src="${data.preferences.logo}" class="" />`,
        };
      }

      const templateConfigs = {
        sadt: {
          format: 'a4',
          orientation: 'landscape',
        },
        default: {
          format: 'a4',
          orientation: 'portrait',
          border: marginConfig,
          header: headerConfig,
          footer: {
            height: '50mm',
          },
        },
      };

      pdf
        .create(
          html,
          template === 'sadt' ? templateConfigs.sadt : templateConfigs.default
        )
        .toFile(pdf_src, function (err) {
          if (err) {
            reject(err);
          }
          resolve(true);
        });
    });
  };

  const readPDF = async function () {
    return new Promise((resolve) => {
      var file = fs.readFileSync(pdf_src);

      resolve({
        file: file,
      });
    });
  };

  const normalizeData = async function (data) {
    return new Promise((resolve) => {
      var normalized = data;
      normalized.date_now = moment().format('DD/MM/YYYY');
      resolve(normalized);
    });
  };

  const render = function () {
    var out = {};

    return new Promise(async function (resolve, reject) {
      await bodyValidation();

      await normalizeData(body_data)
        .then(function (data) {
          out.data = data;
        })
        .catch(function (e) {
          reject(e);
        });

      await readTemplate(out.data)
        .then(function (html) {
          out.html = html;
        })
        .catch(function (e) {
          reject(e);
        });

      await createPDF(out.html, out.data)
        .then(function (generated) {
          out.pdf_generated = generated;
        })
        .catch(function (e) {
          reject(e);
        });

      await readPDF()
        .then(function (pdf) {
          out.pdf = pdf;
        })
        .catch(function (e) {
          reject(e);
        });

      resolve(out);
    });
  };

  render()
    .then(function (r) {
      fs.unlinkSync(pdf_src);
      console.log(`Pdf ${pdf_name} generated`);

      if (download_pdf) {
        res.set('Content-Disposition', `attachment;filename=${pdf_name}`);
        res.set('Content-Disposition', `inline;filename=${pdf_name}`);
        res.set('Content-Type', 'application/octet-stream');
        res.status(200).send(r.pdf.file);
        return;
      }
      if (render_pdf) {
        res.contentType('application/pdf');
        res.status(200).send(r.pdf.file);
        return;
      }
    })
    .catch(function (e) {
      console.log(e);
      res
        .status(400)
        .send({ code: 400, msg: 'Problemas ao gerar pdf', data: e });
    });
};
