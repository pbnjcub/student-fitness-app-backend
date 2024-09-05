const BaseDTO = require('../../dto/BaseDTO');

class AnthroDto extends BaseDTO {
    constructor(anthro) {
        super(anthro, {
            'id': true,
            'teacherUserId': true,
            'studentUserId': true,
            'dateRecorded': true,
            'height': true,
            'weight': true,
            'createdAt': false,
            'updatedAt': false,
        });
    }
}

module.exports = AnthroDto;